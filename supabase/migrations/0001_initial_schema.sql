-- Slated initial schema
-- Phase 1: events, ingest sources, status-change history.
-- Multi-tenant via Supabase Auth + RLS from day one.

-- ============================================================================
-- Enums
-- ============================================================================

-- Real-platform RSVP states. Maps to:
--   Partiful UI: "On the List" = approved, "Waitlist", "Pending", "Interested"
--   Luma email:  "Registration confirmed" = approved, "You're on the waitlist", "You are invited"
create type event_status as enum (
  'pending',     -- RSVP submitted, awaiting host decision
  'waitlist',    -- Host placed on waitlist
  'approved',    -- Confirmed attending (Partiful "On the List" / Luma "Registration confirmed")
  'invited',     -- Invitation received, not yet responded to
  'interested',  -- Soft expression of interest, not an RSVP
  'declined'     -- Declined by user or host
);

create type event_source as enum (
  'partiful',
  'luma',
  'techweek_a16z'
);

-- How we learned the current status. Drives confidence indicators in UI.
create type status_detection_method as enum (
  'ical_pending_tag',        -- Partiful: [Pending] tag in SUMMARY
  'ical_location_reveal',    -- Partiful: location field transitioned from gated to real address
  'luma_email_subject',      -- Luma: parsed from email subject line
  'screenshot_upload',       -- User uploaded screenshot of Partiful UI
  'manual',                  -- User-edited
  'initial_import'           -- Unknown — initial state on first observation
);

-- ============================================================================
-- Tables
-- ============================================================================

-- Per-user ingest sources. One row per (user, source_type) for sources
-- that need per-user configuration.
create table source_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type event_source not null,

  -- Partiful: user's iCal URL (from their Partiful calendar export)
  -- Luma: not used here — Gmail watch handles it
  -- TechWeek a16z: not used — catalog is global, shared cron
  ical_url text,

  last_polled_at timestamptz,
  last_poll_error text,
  created_at timestamptz not null default now(),

  unique (user_id, source_type)
);

-- Normalized events. One row per (user, source, source_event_id).
-- A Partiful event RSVP'd by 10 different users = 10 rows. Intentional —
-- per-user status diverges and we own each user's slice.
create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Source identity
  source_type event_source not null,
  source_event_id text not null,    -- Partiful slug (e.g. "nNJ80KODX1rqDJbIKCln"), Luma "evt-xxx", etc.

  -- Display fields
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,                    -- "Mr. Purple Rooftop, 180 Orchard St" OR "Location available once Approved"
  location_is_gated boolean not null default false,  -- True when source says location is approval-gated
  url text,                         -- Event detail URL on source platform

  -- Status
  status event_status not null,
  status_is_inferred boolean not null default false,  -- True for Partiful heuristic, false for direct (Luma email)
  status_detection_method status_detection_method not null default 'initial_import',

  -- Provenance + observability
  raw_data jsonb,                   -- Original ICS VEVENT or email payload, for debugging
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  unique (user_id, source_type, source_event_id)
);

-- Status-change log. Drives the "needs my action" feed: any row inserted
-- here since the user's last visit is something to surface.
create table event_status_history (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,  -- denormalized for RLS perf
  from_status event_status,         -- null on initial insert
  to_status event_status not null,
  detected_via status_detection_method not null,
  changed_at timestamptz not null default now(),
  notes text                        -- e.g. "iCal poll detected [Pending] tag removed"
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index events_user_starts_idx on events(user_id, starts_at);
create index events_user_status_idx on events(user_id, status);
create index history_user_changed_idx on event_status_history(user_id, changed_at desc);
create index history_event_idx on event_status_history(event_id, changed_at desc);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table source_subscriptions enable row level security;
alter table events enable row level security;
alter table event_status_history enable row level security;

create policy subs_own on source_subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy events_own on events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy history_own on event_status_history for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
