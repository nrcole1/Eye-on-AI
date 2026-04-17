-- ============================================
-- Signal/AI — Supabase database schema
-- Run this in your Supabase SQL Editor once
-- ============================================

-- Articles table: stores both manually curated (featured) and auto-fetched RSS items
create table if not exists articles (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  url         text not null unique,
  source      text,
  image_url   text,
  tag         text default 'News',
  featured    boolean default false,
  published_at timestamptz default now(),
  created_at  timestamptz default now()
);

-- Indexes for fast querying
create index if not exists idx_articles_featured on articles(featured);
create index if not exists idx_articles_published on articles(published_at desc);

-- Row Level Security: public can read, only service_role can write
alter table articles enable row level security;

-- Anyone (even anon users) can read articles
create policy "Public read access"
  on articles for select
  using (true);

-- Only service role can insert/update/delete (done via API with service key)
-- No policies needed for service_role — it bypasses RLS automatically


-- ============================================
-- Optional: newsletter subscribers table
-- If you want to store signups in Supabase instead of logs
-- ============================================
create table if not exists subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  source     text default 'website',
  created_at timestamptz default now()
);

alter table subscribers enable row level security;
-- No public read policy — subscribers should be private
-- Service role bypasses RLS and handles writes


-- ============================================
-- Optional: contact form submissions
-- ============================================
create table if not exists contact_submissions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  company    text,
  message    text not null,
  created_at timestamptz default now()
);

alter table contact_submissions enable row level security;
