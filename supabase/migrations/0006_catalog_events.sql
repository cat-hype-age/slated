-- 0006_catalog_events.sql
-- Global catalog of events for discovery surfaces (TechWeek a16z and
-- future external catalogs). Distinct from the per-user events table —
-- catalog rows have NO user_id; they're shared across all users, and the
-- UI lets a user "add to my schedule" which then writes a row to events
-- with their user_id.
--
-- For now there's one catalog (techweek-nyc-2026); the `catalog_source`
-- column makes it extensible if we add more (techweek-sf-2026,
-- consensus-vegas, etc.).

create table catalog_events (
  id uuid primary key default gen_random_uuid(),

  -- Which catalog this row belongs to
  catalog_source text not null,            -- e.g. 'techweek-nyc-2026'

  -- Display / sort
  title text not null,
  starts_at timestamptz,                   -- Composed from day + time (ET); nullable for events with unparseable time
  day_label text not null,                 -- "Mon Jun 1" — preserved verbatim for display fallback
  time_label text not null,                -- "9:30 AM" — preserved verbatim
  location text,                           -- Neighborhood-level ("Flatiron", "Midtown")
  host text,                               -- Comma-separated co-host string
  tracks text[] not null default '{}',     -- One or more track tags (cross-categorized in catalog)

  -- Where to RSVP
  source_url text,                         -- Partiful/Luma/Splashthat URL; empty/"Invite Only" for some
  source_platform text,                    -- 'partiful' | 'luma' | 'splashthat' | 'invite_only' | 'other'

  -- Operational
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  -- Dedupe key:
  --   * Primary: (catalog_source, source_url) when source_url is non-empty
  --   * Tiebreaker: title — for "Invite Only" rows that share an empty URL
  --     but are distinct events, the title makes them unique
  unique (catalog_source, source_url, title)
);

create index catalog_events_starts_at_idx on catalog_events (starts_at);
create index catalog_events_tracks_idx on catalog_events using gin (tracks);
create index catalog_events_source_idx on catalog_events (catalog_source);

alter table catalog_events enable row level security;

-- Catalog is public — any authenticated user can browse all rows for discovery.
-- (Anonymous users get nothing; sign-in is the gate.)
create policy "authenticated read catalog"
  on catalog_events for select
  to authenticated
  using (true);

-- Inserts/updates only via service role (the ingestion edge function below).
-- No client-side INSERT/UPDATE policy is intentional.
