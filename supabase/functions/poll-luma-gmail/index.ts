// poll-luma-gmail
//
// For each user with valid Gmail credentials in gmail_credentials:
//   1. Refresh the Google access token if expired
//   2. List Gmail messages from luma-mail.com senders since last_polled_at
//   3. For each new message: fetch headers + plaintext body, parse with the
//      shared Luma email parser. For each event the parser recognizes,
//      enrich with public-page metadata (real start time, location, geo)
//      via the JSON-LD scraper.
//   4. Upsert into events; log event_status_history on status change.
//   5. Update last_polled_at + last_history_id; populate last_poll_error on
//      failure.
//
// Body: optional `{ user_id: string }` to scope to one user (for the
// post-OAuth immediate first poll, and for the dashboard refresh button).
// With no body, process every user (the cron path).
//
// Env required (provided by Lovable secrets — same vars the OAuth callback
// edge function uses):
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   SUPABASE_URL                  (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY     (auto-injected)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { parseLumaEmail, type LumaParsedEvent } from "../_shared/parsers/luma.ts";
import {
  fetchLumaEventMeta,
  type LumaEventMeta,
} from "../_shared/parsers/luma_page.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";

// Refresh-token slack: refresh when access token has less than this many
// seconds left. Avoids racing the expiration during a long poll cycle.
const REFRESH_SLACK_SECONDS = 60;

interface GmailCredential {
  id: string;
  user_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  scope: string;
  last_history_id: string | null;
  last_polled_at: string | null;
}

interface GmailMessageMeta {
  id: string;
  threadId: string;
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
  headers?: Array<{ name: string; value: string }>;
}

interface GmailMessage {
  id: string;
  threadId: string;
  historyId?: string;
  payload?: GmailMessagePart;
}

// ----- Token management -----

async function ensureFreshAccessToken(
  admin: ReturnType<typeof createClient>,
  cred: GmailCredential,
): Promise<string> {
  const now = Date.now();
  const expiresAt = cred.access_token_expires_at
    ? Date.parse(cred.access_token_expires_at)
    : 0;

  if (cred.access_token && expiresAt > now + REFRESH_SLACK_SECONDS * 1000) {
    return cred.access_token;
  }

  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID / SECRET not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: cred.refresh_token,
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token refresh ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json() as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type: string;
  };

  const newExpiresAt = new Date(now + json.expires_in * 1000).toISOString();
  await admin
    .from("gmail_credentials")
    .update({
      access_token: json.access_token,
      access_token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cred.id);

  return json.access_token;
}

// ----- Gmail API helpers -----

async function listLumaMessages(
  accessToken: string,
  sinceUnixSeconds: number,
): Promise<GmailMessageMeta[]> {
  // Gmail search query: from any luma-mail.com subdomain, after the given
  // unix timestamp. Pagination kept simple — Luma sends a few emails per
  // event so 500 covers many weeks of activity.
  const q = `from:luma-mail.com after:${sinceUnixSeconds}`;
  const url = `${GMAIL_API_BASE}/messages?q=${encodeURIComponent(q)}&maxResults=500`;

  const messages: GmailMessageMeta[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const pagedUrl: string = pageToken
      ? `${url}&pageToken=${encodeURIComponent(pageToken)}`
      : url;
    const res = await fetch(pagedUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`gmail messages.list ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = await res.json() as {
      messages?: GmailMessageMeta[];
      nextPageToken?: string;
    };
    if (json.messages) messages.push(...json.messages);
    pageToken = json.nextPageToken;
  } while (pageToken);

  return messages;
}

async function fetchMessage(accessToken: string, id: string): Promise<GmailMessage> {
  const url = `${GMAIL_API_BASE}/messages/${id}?format=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`gmail messages.get ${res.status}`);
  }
  return await res.json() as GmailMessage;
}

function getHeader(payload: GmailMessagePart | undefined, name: string): string {
  if (!payload?.headers) return "";
  const h = payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function decodeBase64Url(s: string): string {
  // Gmail uses base64url; convert to standard base64 then decode
  const standard = s.replace(/-/g, "+").replace(/_/g, "/");
  // Pad if needed
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
  try {
    return atob(padded);
  } catch {
    return "";
  }
}

function extractPlainText(part: GmailMessagePart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  if (part.parts) {
    for (const sub of part.parts) {
      const text = extractPlainText(sub);
      if (text) return text;
    }
  }
  // Fall back to text/html stripped — rarely needed, Luma emails carry plaintext
  if (part.mimeType === "text/html" && part.body?.data) {
    const html = decodeBase64Url(part.body.data);
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  return "";
}

// Combine venue name + address into a single human-readable string for the
// events.location column. If the venue name is already part of the address,
// don't repeat it.
function formatLocation(meta: LumaEventMeta | null): string | null {
  if (!meta) return null;
  if (!meta.locationName && !meta.locationAddress) return null;
  if (!meta.locationName) return meta.locationAddress;
  if (!meta.locationAddress) return meta.locationName;
  if (meta.locationAddress.startsWith(meta.locationName)) return meta.locationAddress;
  return `${meta.locationName}, ${meta.locationAddress}`;
}

// ----- Per-subscription processing -----

async function processCredential(
  admin: ReturnType<typeof createClient>,
  cred: GmailCredential,
): Promise<{ processed: number }> {
  const accessToken = await ensureFreshAccessToken(admin, cred);

  // First poll: 30-day lookback. Subsequent polls: since last_polled_at.
  const lastPolled = cred.last_polled_at ? Date.parse(cred.last_polled_at) : 0;
  const sinceMs = lastPolled || Date.now() - 30 * 24 * 60 * 60 * 1000;
  const sinceUnixSeconds = Math.floor(sinceMs / 1000);

  const messageMetas = await listLumaMessages(accessToken, sinceUnixSeconds);
  if (messageMetas.length === 0) {
    await admin
      .from("gmail_credentials")
      .update({
        last_polled_at: new Date().toISOString(),
        last_poll_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cred.id);
    return { processed: 0 };
  }

  // Fetch + parse each Gmail message
  const parsed: Array<LumaParsedEvent & { raw: GmailMessage }> = [];
  for (const meta of messageMetas) {
    let msg: GmailMessage;
    try {
      msg = await fetchMessage(accessToken, meta.id);
    } catch {
      continue; // skip broken messages, keep going
    }
    const subject = getHeader(msg.payload, "Subject");
    const from = getHeader(msg.payload, "From");
    const bodyText = extractPlainText(msg.payload);

    const result = parseLumaEmail({ subject, from, bodyText });
    if (result) parsed.push({ ...result, raw: msg });
  }

  if (parsed.length === 0) {
    await admin
      .from("gmail_credentials")
      .update({
        last_polled_at: new Date().toISOString(),
        last_poll_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cred.id);
    return { processed: 0 };
  }

  // Diff against existing rows
  const sourceIds = parsed.map((p) => p.sourceEventId);
  const { data: existing } = await admin
    .from("events")
    .select("source_event_id,status")
    .eq("user_id", cred.user_id)
    .eq("source_type", "luma")
    .in("source_event_id", sourceIds);

  const existingMap = new Map<string, string>();
  (existing ?? []).forEach((r: { source_event_id: string; status: string }) =>
    existingMap.set(r.source_event_id, r.status),
  );

  const now = new Date().toISOString();

  // Dedupe within batch: multiple emails can map to the same Luma event
  // (confirm + later waitlist update, etc). Gmail messages.list returns
  // newest first, so the first occurrence per sourceEventId is the
  // freshest signal — keep that one.
  const seen = new Set<string>();
  const deduped = parsed.filter((p) => {
    if (seen.has(p.sourceEventId)) return false;
    seen.add(p.sourceEventId);
    return true;
  });

  // Enrich with public-page metadata (real start times, locations, geo).
  // Luma's email payload only carries title + status; the event page itself
  // has JSON-LD with startDate/endDate/location/geo. One HTTP fetch per
  // distinct event per poll, parallelized. If a fetch fails, we fall back
  // to the now() placeholder for starts_at and null for the rest — the
  // event still lands in the schedule, just sorts by ingest time and shows
  // no venue.
  const enriched = await Promise.all(
    deduped.map(async (p) => ({
      ...p,
      meta: await fetchLumaEventMeta(p.sourceEventId),
    })),
  );

  const upsertRows = enriched.map((p) => {
    const isNew = !existingMap.has(p.sourceEventId);
    return {
      user_id: cred.user_id,
      source_type: "luma",
      source_event_id: p.sourceEventId,
      title: p.title,
      starts_at: p.meta?.startsAt ?? now,
      ends_at: p.meta?.endsAt ?? null,
      location: formatLocation(p.meta),
      location_is_gated: false,
      url: `https://luma.com/${p.sourceEventId}`,
      status: p.status,
      status_is_inferred: false, // Luma email is direct
      status_detection_method: isNew ? "initial_import" : p.detectedVia,
      raw_data: {
        message_id: p.raw.id,
        thread_id: p.raw.threadId,
        page_meta: p.meta, // null if scrape failed; useful for debugging
      },
      last_seen_at: now,
    };
  });

  const { error: upsertErr } = await admin
    .from("events")
    .upsert(upsertRows, { onConflict: "user_id,source_type,source_event_id" });
  if (upsertErr) throw upsertErr;

  // History on status change
  const changed = enriched.filter((p) => {
    const prev = existingMap.get(p.sourceEventId);
    return prev !== undefined && prev !== p.status;
  });
  if (changed.length) {
    const { data: idRows } = await admin
      .from("events")
      .select("id,source_event_id")
      .eq("user_id", cred.user_id)
      .eq("source_type", "luma")
      .in("source_event_id", changed.map((p) => p.sourceEventId));
    const idMap = new Map<string, string>();
    (idRows ?? []).forEach((r: { id: string; source_event_id: string }) =>
      idMap.set(r.source_event_id, r.id),
    );
    const historyRows = changed
      .map((p) => {
        const eid = idMap.get(p.sourceEventId);
        if (!eid) return null;
        return {
          user_id: cred.user_id,
          event_id: eid,
          from_status: existingMap.get(p.sourceEventId),
          to_status: p.status,
          detected_via: p.detectedVia,
        };
      })
      .filter(Boolean);
    if (historyRows.length) {
      await admin.from("event_status_history").insert(historyRows as never);
    }
  }

  await admin
    .from("gmail_credentials")
    .update({
      last_polled_at: now,
      last_poll_error: null,
      updated_at: now,
    })
    .eq("id", cred.id);

  return { processed: enriched.length };
}

// ----- HTTP handler -----

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let targetUserId: string | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body.user_id === "string") targetUserId = body.user_id;
    }
  } catch (_) { /* ignore */ }

  let q = admin
    .from("gmail_credentials")
    .select("id,user_id,refresh_token,access_token,access_token_expires_at,scope,last_history_id,last_polled_at");
  if (targetUserId) q = q.eq("user_id", targetUserId);

  const { data: creds, error: credsErr } = await q;
  if (credsErr) {
    return new Response(
      JSON.stringify({ error: credsErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const results: Array<{ user_id: string; ok: boolean; error?: string; processed?: number }> = [];
  for (const cred of (creds ?? []) as GmailCredential[]) {
    try {
      const r = await processCredential(admin, cred);
      results.push({ user_id: cred.user_id, ok: true, processed: r.processed });
    } catch (e) {
      const msg = e instanceof Error
        ? e.message
        : (e && typeof e === "object" ? JSON.stringify(e) : String(e));
      await admin
        .from("gmail_credentials")
        .update({
          last_poll_error: msg,
          last_polled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", cred.id);
      results.push({ user_id: cred.user_id, ok: false, error: msg });
    }
  }

  return new Response(
    JSON.stringify({ results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
