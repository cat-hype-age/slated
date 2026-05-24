// ingest-techweek-catalog
//
// Pulls the per-track JSON files from data/techweek-nyc-2026/ in the public
// repo, dedupes cross-track rows into single catalog entries with a tracks[]
// array, parses day+time labels into real timestamps (ET / EDT in summer),
// and upserts into catalog_events.
//
// Invoked manually for one-time ingest, and on a daily cron (GitHub Actions
// or pg_cron once enabled) to pick up new events that TechWeek adds between
// now and kickoff (Jun 1).
//
// Body: none required. Optional `{ catalog_source: "...", base_url: "..." }`
// to point at a different snapshot dir (for testing or future catalogs).
//
// Env (auto-injected by Supabase):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DEFAULT_BASE_URL =
  "https://raw.githubusercontent.com/cat-hype-age/slated/main/data/techweek-nyc-2026";

const DEFAULT_CATALOG_SOURCE = "techweek-nyc-2026";

const TRACKS = [
  "ai-infra",
  "hackathons",
  "fintech",
  "founders",
  "investors",
  "engineers",
  "gtm",
  "students",
];

// TechWeek NYC 2026 runs Jun 1-7. EDT (Eastern Daylight Time) is UTC-4 in
// June. Hardcoded for this catalog; future catalogs would parameterize.
const YEAR = 2026;
const TZ_OFFSET = "-04:00";

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

interface RawRow {
  title: string;
  day: string;
  time: string;
  location: string;
  host: string;
  track: string;
  rsvp_url: string;
}

interface GroupedRow {
  title: string;
  day_label: string;
  time_label: string;
  location: string;
  host: string;
  tracks: Set<string>;
  rsvp_url_raw: string;
}

// "Mon Jun 1" + "9:30 AM" → "2026-06-01T09:30:00-04:00"
function parseDayTime(day: string, time: string): string | null {
  const dayMatch = day.match(
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/,
  );
  if (!dayMatch) return null;
  const month = MONTHS[dayMatch[1]];
  const dayOfMonth = parseInt(dayMatch[2], 10);
  if (!month || !dayOfMonth) return null;

  const timeMatch = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!timeMatch) return null;
  let hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);
  const ampm = timeMatch[3].toUpperCase();
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${YEAR}-${pad(month)}-${pad(dayOfMonth)}T${pad(hour)}:${pad(minute)}:00${TZ_OFFSET}`;
}

function normalizeUrl(url: string): string | null {
  const trimmed = (url || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "invite only") return null;
  return trimmed;
}

function detectPlatform(url: string): string {
  const u = (url || "").toLowerCase();
  if (!u || u === "invite only") return "invite_only";
  if (u.includes("partiful.com")) return "partiful";
  if (u.includes("luma.com") || u.includes("lu.ma")) return "luma";
  if (u.includes("splashthat.com")) return "splashthat";
  return "other";
}

async function fetchAllTrackRows(baseUrl: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  for (const track of TRACKS) {
    const res = await fetch(`${baseUrl}/${track}.json`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`fetch ${track}.json: ${res.status} ${res.statusText}`);
    }
    const rows = await res.json() as RawRow[];
    all.push(...rows);
  }
  return all;
}

// Group cross-track duplicates into one row with merged tracks[].
// Key: source URL when present (events with the same Partiful URL are the
// same event); title as tiebreaker for "Invite Only" rows.
function groupRows(rows: RawRow[]): GroupedRow[] {
  const map = new Map<string, GroupedRow>();
  for (const row of rows) {
    const url = normalizeUrl(row.rsvp_url) ?? "";
    const key = `${url}|${row.title}`;
    const existing = map.get(key);
    if (existing) {
      existing.tracks.add(row.track);
    } else {
      map.set(key, {
        title: row.title,
        day_label: row.day,
        time_label: row.time,
        location: row.location,
        host: row.host,
        tracks: new Set([row.track]),
        rsvp_url_raw: row.rsvp_url,
      });
    }
  }
  return Array.from(map.values());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let baseUrl = DEFAULT_BASE_URL;
  let catalogSource = DEFAULT_CATALOG_SOURCE;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.base_url === "string") baseUrl = body.base_url;
      if (typeof body?.catalog_source === "string") catalogSource = body.catalog_source;
    }
  } catch (_) { /* ignore */ }

  try {
    const rawRows = await fetchAllTrackRows(baseUrl);
    const grouped = groupRows(rawRows);
    const now = new Date().toISOString();

    const upsertRows = grouped.map((g) => ({
      catalog_source: catalogSource,
      title: g.title,
      starts_at: parseDayTime(g.day_label, g.time_label),
      day_label: g.day_label,
      time_label: g.time_label,
      location: g.location || null,
      host: g.host || null,
      tracks: Array.from(g.tracks).sort(),
      source_url: normalizeUrl(g.rsvp_url_raw),
      source_platform: detectPlatform(g.rsvp_url_raw),
      last_seen_at: now,
    }));

    const { error } = await admin
      .from("catalog_events")
      .upsert(upsertRows, { onConflict: "catalog_source,source_url,title" });
    if (error) throw error;

    return new Response(
      JSON.stringify({
        ok: true,
        catalog_source: catalogSource,
        source_rows: rawRows.length,
        unique_events: upsertRows.length,
        time_parsed: upsertRows.filter((r) => r.starts_at !== null).length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error
      ? e.message
      : (e && typeof e === "object" ? JSON.stringify(e) : String(e));
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
