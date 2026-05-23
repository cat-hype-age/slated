// TODO: schedule hourly via pg_cron when available
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Status = "pending" | "waitlist" | "approved" | "invited" | "interested" | "declined";

interface ParsedEvent {
  source_event_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  location_is_gated: boolean;
  url: string | null;
  status: Status;
  status_is_inferred: boolean;
  status_detection_method: string;
  raw_data: Record<string, string>;
}

const GATED_LOC = "Location available once Approved";

function unfoldIcs(text: string): string {
  // RFC5545 line unfolding: a CRLF followed by whitespace continues the previous line
  return text.replace(/\r?\n[ \t]/g, "");
}

function parseIcsDate(value: string): string | null {
  // Handles forms: 20260602T180000Z, 20260602T180000, 20260602
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (!hh) return new Date(`${y}-${mo}-${d}T00:00:00Z`).toISOString();
  const iso = `${y}-${mo}-${d}T${hh}:${mm}:${ss}${z ? "Z" : "Z"}`;
  return new Date(iso).toISOString();
}

function unescapeIcs(v: string): string {
  return v.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseVEvents(ics: string): Array<Record<string, string>> {
  const unfolded = unfoldIcs(ics);
  const lines = unfolded.split(/\r?\n/);
  const events: Array<Record<string, string>> = [];
  let current: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const keyRaw = line.slice(0, idx);
      const val = line.slice(idx + 1);
      const key = keyRaw.split(";")[0]; // strip params like DTSTART;TZID=...
      current[key] = val;
    }
  }
  return events;
}

function extractPartifulSlug(description: string | undefined, url: string | undefined): string | null {
  const candidates = [description ?? "", url ?? ""];
  for (const c of candidates) {
    const m = c.match(/partiful\.com\/e\/([A-Za-z0-9_-]+)/);
    if (m) return m[1];
  }
  return null;
}

function classify(summary: string, location: string): { status: Status; method: string; gated: boolean } {
  const hasPending = /\[Pending\]/i.test(summary);
  const gated = location.startsWith(GATED_LOC);
  if (hasPending) {
    return { status: "pending", method: "ical_pending_tag", gated };
  }
  if (gated) {
    // Strong signal: the gated string is still present → user hasn't been approved yet.
    return { status: "waitlist", method: "ical_location_revealed", gated: true };
  }
  // Weak signal: location is just visible. Could be a public-by-default event the
  // user was never actually approved to. Worth a softer confidence indicator in UI.
  return { status: "approved", method: "ical_location_public", gated: false };
}

function cleanTitle(summary: string): string {
  let t = summary.replace(/^\s*\[Pending\]\s*/i, "");
  t = t.replace(/\s*\|\s*Partiful\s*$/i, "");
  return unescapeIcs(t).trim();
}

async function processSubscription(
  admin: ReturnType<typeof createClient>,
  sub: { id: string; user_id: string; ical_url: string | null },
) {
  if (!sub.ical_url) throw new Error("missing ical_url");
  const res = await fetch(sub.ical_url, { headers: { Accept: "text/calendar" } });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const ics = await res.text();
  const raw = parseVEvents(ics);

  const parsed: ParsedEvent[] = [];
  for (const v of raw) {
    const summary = unescapeIcs(v.SUMMARY ?? "");
    const location = unescapeIcs(v.LOCATION ?? "");
    const description = unescapeIcs(v.DESCRIPTION ?? "");
    const urlField = v.URL ?? "";
    const slug = extractPartifulSlug(description, urlField);
    if (!slug) continue;
    const starts = v.DTSTART ? parseIcsDate(v.DTSTART) : null;
    if (!starts) continue;
    const ends = v.DTEND ? parseIcsDate(v.DTEND) : null;
    const urlMatch = (description + "\n" + urlField).match(/https?:\/\/partiful\.com\/e\/[A-Za-z0-9_-]+/);
    const { status, method, gated } = classify(summary, location);
    parsed.push({
      source_event_id: slug,
      title: cleanTitle(summary),
      starts_at: starts,
      ends_at: ends,
      location: location || null,
      location_is_gated: gated,
      url: urlMatch ? urlMatch[0] : null,
      status,
      status_is_inferred: true,
      status_detection_method: method,
      raw_data: v,
    });
  }

  // Fetch existing rows for diffing status
  const slugs = parsed.map((p) => p.source_event_id);
  const { data: existing } = await admin
    .from("events")
    .select("source_event_id,status")
    .eq("user_id", sub.user_id)
    .eq("source_type", "partiful")
    .in("source_event_id", slugs.length ? slugs : [""]);

  const existingMap = new Map<string, string>();
  (existing ?? []).forEach((r: { source_event_id: string; status: string }) =>
    existingMap.set(r.source_event_id, r.status),
  );

  const now = new Date().toISOString();
  const upsertRows = parsed.map((p) => {
    const isNew = !existingMap.has(p.source_event_id);
    return {
      user_id: sub.user_id,
      source_type: "partiful",
      source_event_id: p.source_event_id,
      title: p.title,
      starts_at: p.starts_at,
      ends_at: p.ends_at,
      location: p.location,
      location_is_gated: p.location_is_gated,
      url: p.url,
      status: p.status,
      status_is_inferred: p.status_is_inferred,
      status_detection_method: isNew ? "initial_import" : p.status_detection_method,
      raw_data: p.raw_data,
      last_seen_at: now,
    };
  });

  if (upsertRows.length) {
    const { error: upsertErr } = await admin
      .from("events")
      .upsert(upsertRows, { onConflict: "user_id,source_type,source_event_id" });
    if (upsertErr) throw upsertErr;
  }

  // History on status change
  const changed = parsed.filter((p) => {
    const prev = existingMap.get(p.source_event_id);
    return prev !== undefined && prev !== p.status;
  });
  if (changed.length) {
    const { data: idRows } = await admin
      .from("events")
      .select("id,source_event_id")
      .eq("user_id", sub.user_id)
      .eq("source_type", "partiful")
      .in("source_event_id", changed.map((p) => p.source_event_id));
    const idMap = new Map<string, string>();
    (idRows ?? []).forEach((r: { id: string; source_event_id: string }) =>
      idMap.set(r.source_event_id, r.id),
    );
    const toInsert = changed
      .map((p) => {
        const eid = idMap.get(p.source_event_id);
        if (!eid) return null;
        return {
          user_id: sub.user_id,
          event_id: eid,
          from_status: existingMap.get(p.source_event_id),
          to_status: p.status,
          detected_via: p.status_detection_method,
        };
      })
      .filter(Boolean);
    if (toInsert.length) {
      await admin.from("event_status_history").insert(toInsert as never);
    }
  }


  await admin
    .from("source_subscriptions")
    .update({ last_polled_at: now, last_poll_error: null })
    .eq("id", sub.id);

  return { processed: parsed.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
    .from("source_subscriptions")
    .select("id,user_id,ical_url")
    .eq("source_type", "partiful");
  if (targetUserId) q = q.eq("user_id", targetUserId);

  const { data: subs, error: subsErr } = await q;
  if (subsErr) {
    return new Response(JSON.stringify({ error: subsErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ user_id: string; ok: boolean; error?: string; processed?: number }> = [];
  for (const sub of subs ?? []) {
    try {
      const r = await processSubscription(admin, sub as never);
      results.push({ user_id: sub.user_id, ok: true, processed: r.processed });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin
        .from("source_subscriptions")
        .update({ last_poll_error: msg, last_polled_at: new Date().toISOString() })
        .eq("id", sub.id);
      results.push({ user_id: sub.user_id, ok: false, error: msg });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
