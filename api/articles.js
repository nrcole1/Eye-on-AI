// /api/articles.js
// Returns featured articles (from Supabase) + latest RSS articles merged.
// Called on page load by index.html.

import { createClient } from '@supabase/supabase-js';

const RSS_FEEDS = [
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source: 'TechCrunch', tag: 'Industry' },
  { url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', source: 'The Verge', tag: 'Industry' },
  { url: 'https://venturebeat.com/category/ai/feed/', source: 'VentureBeat', tag: 'Industry' },
  { url: 'https://www.anthropic.com/news/rss.xml', source: 'Anthropic', tag: 'Model Release' },
  { url: 'https://openai.com/blog/rss.xml', source: 'OpenAI', tag: 'Model Release' },
  { url: 'https://huggingface.co/blog/feed.xml', source: 'Hugging Face', tag: 'Open Source' }
];

// Basic in-memory cache (per warm function instance)
let cache = { data: null, ts: 0 };
const CACHE_MS = 10 * 60 * 1000; // 10 minutes

export default async function handler(req, res) {
  try {
    // Serve cache if fresh
    if (cache.data && Date.now() - cache.ts < CACHE_MS) {
      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
      return res.status(200).json(cache.data);
    }

    // 1. Fetch featured articles from Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY // anon key is fine here — RLS allows public read
    );

    const { data: featuredArticles, error: dbErr } = await supabase
      .from('articles')
      .select('*')
      .eq('featured', true)
      .order('published_at', { ascending: false })
      .limit(6);

    if (dbErr) console.error('Supabase error:', dbErr.message);

    // 2. Fetch latest RSS articles in parallel
    const rssResults = await Promise.allSettled(
      RSS_FEEDS.map(feed => fetchFeed(feed))
    );
    const rssArticles = rssResults
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
      .slice(0, 12);

    // 3. Deduplicate — if an RSS article matches a featured URL, skip it
    const featuredUrls = new Set((featuredArticles || []).map(a => a.url));
    const latestArticles = rssArticles.filter(a => !featuredUrls.has(a.url));

    const payload = {
      featured: featuredArticles || [],
      latest: latestArticles
    };

    cache = { data: payload, ts: Date.now() };
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('Articles API error:', err.message);
    return res.status(500).json({ error: 'Failed to load articles', featured: [], latest: [] });
  }
}

async function fetchFeed({ url, source, tag }) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Signal-AI-News-Bot/1.0' },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return parseFeed(xml, source, tag).slice(0, 4);
  } catch (err) {
    console.error(`Feed failed: ${url}`, err.message);
    return [];
  }
}

// Minimal RSS + Atom parser — handles both formats without dependencies
function parseFeed(xml, source, tag) {
  const items = [];
  // Try RSS first
  const rssMatches = xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi);
  for (const match of rssMatches) {
    const item = parseItem(match[1], source, tag);
    if (item) items.push(item);
  }
  // If empty, try Atom
  if (items.length === 0) {
    const atomMatches = xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi);
    for (const match of atomMatches) {
      const item = parseAtomEntry(match[1], source, tag);
      if (item) items.push(item);
    }
  }
  return items;
}

function parseItem(xml, source, tag) {
  const title = extract(xml, 'title');
  const link = extract(xml, 'link') || extractAttr(xml, 'link', 'href');
  const description = stripHtml(extract(xml, 'description') || extract(xml, 'content:encoded') || '');
  const pubDate = extract(xml, 'pubDate') || extract(xml, 'dc:date');
  if (!title || !link) return null;
  return {
    id: link,
    title: decode(title),
    description: decode(description).slice(0, 180),
    url: link.trim(),
    source,
    tag,
    featured: false,
    published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
  };
}

function parseAtomEntry(xml, source, tag) {
  const title = extract(xml, 'title');
  const link = extractAttr(xml, 'link', 'href') || extract(xml, 'link');
  const description = stripHtml(extract(xml, 'summary') || extract(xml, 'content') || '');
  const pubDate = extract(xml, 'published') || extract(xml, 'updated');
  if (!title || !link) return null;
  return {
    id: link,
    title: decode(title),
    description: decode(description).slice(0, 180),
    url: link.trim(),
    source,
    tag,
    featured: false,
    published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
  };
}

function extract(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  const cdata = m[1].match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return (cdata ? cdata[1] : m[1]).trim();
}
function extractAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, 'i');
  const m = xml.match(re);
  return m ? m[1] : '';
}
function stripHtml(s) { return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}
