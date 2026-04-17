// /api/admin.js
// Admin endpoint — requires password (ADMIN_PASSWORD env var).
// Handles: list, add, delete, and fetch-metadata actions for articles.

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Password check on every request
  const password = req.headers['x-admin-password'];
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const action = body?.action || (req.method === 'GET' ? 'list' : '');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY // service key bypasses RLS for writes
  );

  try {
    if (action === 'fetch-metadata') {
      // Scrape Open Graph / meta tags from a URL
      const meta = await fetchMetadata(body.url);
      return res.status(200).json(meta);
    }

    if (action === 'list') {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ articles: data });
    }

    if (action === 'add') {
      const { title, description, url, source, image_url, tag, featured } = body;
      if (!title || !url) return res.status(400).json({ error: 'title and url are required' });

      const { data, error } = await supabase
        .from('articles')
        .insert([{
          title: title.trim(),
          description: (description || '').trim(),
          url: url.trim(),
          source: (source || '').trim(),
          image_url: image_url || null,
          tag: tag || 'News',
          featured: !!featured,
          published_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'This URL is already saved.' });
        throw error;
      }
      return res.status(200).json({ article: data });
    }

    if (action === 'update') {
      const { id, ...fields } = body;
      if (!id) return res.status(400).json({ error: 'id is required' });
      delete fields.action;

      const { data, error } = await supabase
        .from('articles')
        .update(fields)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ article: data });
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { error } = await supabase.from('articles').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('Admin API error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// Scrape Open Graph / Twitter Card / meta tags from a URL
async function fetchMetadata(url) {
  if (!url) return { error: 'No URL provided' };
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Signal-AI-Bot/1.0; +https://signal-ai.com)'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return { error: `Fetch failed: ${response.status}` };
    const html = await response.text();

    const title =
      meta(html, 'og:title') ||
      meta(html, 'twitter:title') ||
      extractTag(html, 'title') ||
      '';

    const description =
      meta(html, 'og:description') ||
      meta(html, 'twitter:description') ||
      meta(html, 'description') ||
      '';

    const image =
      meta(html, 'og:image') ||
      meta(html, 'twitter:image') ||
      '';

    const siteName =
      meta(html, 'og:site_name') ||
      new URL(url).hostname.replace('www.', '') ||
      '';

    return {
      title: decodeEntities(title).trim(),
      description: decodeEntities(description).trim().slice(0, 250),
      image_url: image.trim(),
      source: decodeEntities(siteName).trim()
    };
  } catch (err) {
    return { error: err.message };
  }
}

function meta(html, prop) {
  // Matches <meta property="og:title" content="..."> or name="..."
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i')
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return '';
}

function extractTag(html, tag) {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1] : '';
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}
