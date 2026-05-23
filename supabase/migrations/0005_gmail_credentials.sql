-- 0005_gmail_credentials.sql
-- Per-user Gmail OAuth credentials, populated by the dedicated Gmail OAuth
-- flow (separate from Supabase Auth's managed Google sign-in, which is
-- auth-only and doesn't surface Google API tokens).
--
-- One row per user; uniqueness on user_id keeps the table simple. Future
-- multi-account support would relax this constraint and add a label column.
-- Single-account confirmed by Cat for MVP.
--
-- Storage tradeoff for refresh_token:
--   * Plaintext for the ~15-user dogfood week (Cat explicitly consenting
--     to that tradeoff in the relevant turn).
--   * Belt-and-suspenders: the disconnect flow calls Google's revoke
--     endpoint, so even if the DB leaks, revoked tokens can't be used.
--   * Post-MVP hardening: Supabase Vault. No schema change required —
--     swap the column write/read sites to go through Vault.

create table gmail_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,

  -- OAuth tokens from Google
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  scope text not null,  -- e.g. "https://www.googleapis.com/auth/gmail.readonly"

  -- Gmail API incremental-sync cursor. We use history.list for delta
  -- syncing — fetch only messages changed since this historyId, much
  -- cheaper than re-scanning the mailbox each poll.
  last_history_id text,

  -- Operational visibility
  last_polled_at timestamptz,
  last_poll_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index gmail_credentials_user_idx on gmail_credentials(user_id);

alter table gmail_credentials enable row level security;

-- Users can read their own credential row (so frontend can show
-- "Gmail connected" state). Writes happen only via edge functions
-- running with service-role privileges (the OAuth callback + disconnect
-- functions Lovable agent is building) — no client-side INSERT/UPDATE
-- policy is intentional.
create policy "users read own gmail credentials"
  on gmail_credentials for select
  using (auth.uid() = user_id);
