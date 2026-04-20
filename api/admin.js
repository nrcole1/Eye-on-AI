// /api/admin.js
// Single password-protected admin endpoint handling articles, projects, portfolio, and links.
// Actions use `resource:verb` format (e.g., "articles:add", "projects:list").

import { createClient } from '@supabase/supabase-js';

const TABLES = {
  articles: 'articles',
  projects: 'projects',
  portfolio: 'portfolio_items',
  links: 'links'
};

export default async function handler(req, res) {
  const password = req.headers['x-admin-password'];
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const action = body?.action || '';
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    if (action === 'fetch-metadata') {
      return res.status(200).json(await fetchMetadata(body.url));
    }

    const [resource, verb] = action.split(':');
    const table = TABLES[resource];
    if (!table) return res.status(400).json({ error: `Unknown resource: ${resource}` });

    if (verb === 'list') {
      const orderField = body.orderBy || defaultOrder(resource);
      const ascending = body.ascending ?? false;
      const { data, error } = await supabase.from(table).select('*').order(orderField, { ascending });
      if (error) throw error;
      return res.status(200).json({ items: data });
    }

    if (verb === 'add') {
      const payload = sanitize(resource, body);
      if (!validateRequired(resource, payload)) {
        return res.status(400).json({ error: `Missing required fields for ${resource}` });
      }
      const { data, error } = await supabase.from(table).insert([payload]).select().single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'This entry already exists.' });
        throw error;
      }
      return res.status(200).json({ item: data });
    }

    if (verb === 'update') {
      const { id, ...rest } = body;
      if (!id) return res.status(400).json({ error: 'id is required' });
      delete rest.action;
      const payload = sanitize(resource, rest);
      if (resource === 'projects') payload.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json({ item: data });
    }

    if (verb === 'delete') {
      if (!body.id) return res.status(400).json({ error: 'id is required' });
      const { error } = await supabase.from(table).delete().eq('id', body.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown verb: ${verb}` });
  } catch (err) {
    console.error('Admin error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

function defaultOrder(resource) {
  if (resource === 'articles') return 'created_at';
  if (resource === 'projects') return 'updated_at';
  if (resource === 'portfolio') return 'completed_date';
  if (resource === 'links') return 'sort_order';
  return 'created_at';
}

function validateRequired(resource, p) {
  if (resource === 'articles') return p.title && p.url;
  if (resource === 'projects') return p.title;
  if (resource === 'portfolio') return p.name;
  if (resource === 'links') return p.platform && p.url;
  return true;
}

function sanitize(resource, body) {
  const allowed = {
    articles: ['title', 'description', 'url', 'source', 'image_url', 'tag', 'featured', 'published_at'],
    projects: ['title', 'client_name', 'description', 'status', 'progress', 'start_date', 'due_date',
               'hourly_rate', 'budget', 'hours_logged', 'tags', 'show_publicly', 'notes', 'repo_url'],
    portfolio: ['name', 'description', 'repo_url', 'live_url', 'language', 'language_color',
                'tech_stack', 'stars', 'completed_date', 'category', 'pinned'],
    links: ['platform', 'url', 'label', 'sort_order']
  };
  const out = {};
  for (const key of allowed[resource] || []) {
    if (key in body) {
      const v = body[key];
      out[key] = typeof v === 'string' ? v.trim() : v;
    }
  }
  return out;
}

async function fetchMetadata(url) {
  if (!url) return { error: 'No URL provided' };
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Signal-AI-Bot/1.0)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return { error: `Fetch failed: ${response.status}` };
    const html = await response.text();
    return {
      title: decodeEntities(meta(html, 'og:title') || meta(html, 'twitter:title') || extractTag(html, 'title') || '').trim(),
      description: decodeEntities(meta(html, 'og:description') || meta(html, 'twitter:description') || meta(html, 'description') || '').trim().slice(0, 250),
      image_url: (meta(html, 'og:image') || meta(html, 'twitter:image') || '').trim(),
      source: decodeEntities(meta(html, 'og:site_name') || new URL(url).hostname.replace('www.', '') || '').trim()
    };
  } catch (err) {
    return { error: err.message };
  }
}

function meta(html, prop) {
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
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}
