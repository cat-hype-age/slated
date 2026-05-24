// luma_page.ts
//
// Fetch + parse public Luma event pages to extract structured event metadata
// (start time, end time, location, geo coordinates). Used by poll-luma-gmail
// to enrich rows pulled from email — the email subject + from headers carry
// only title + status, not the event date or venue.
//
// Luma's public event pages serve JSON-LD structured data in a
// <script type="application/ld+json"> tag following schema.org/Event. We
// extract that script's contents, JSON.parse it, walk to the Event-typed
// node, and pull the fields we need.
//
// Pure functions; the fetcher takes a fetchImpl parameter so tests can pass
// a mock without monkeypatching globals.

export interface LumaEventMeta {
  startsAt: string | null;        // ISO 8601 with offset, e.g. "2026-06-07T14:00:00.000-04:00"
  endsAt: string | null;
  locationName: string | null;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
}

// Match <script type="application/ld+json" ...>...</script>. The [\s\S]*? is
// non-greedy to handle multiple JSON-LD blocks on one page (take the first).
const JSON_LD_TAG = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i;

export function parseLumaEventJsonLd(html: string): LumaEventMeta | null {
  const match = html.match(JSON_LD_TAG);
  if (!match) return null;

  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }

  // JSON-LD can appear as: a single object, an array of objects, or an
  // object with @graph carrying the array. Normalize to a list, then find
  // the Event-typed entry.
  const candidates: Array<Record<string, unknown>> = Array.isArray(data)
    ? (data as Array<Record<string, unknown>>)
    : typeof data === "object" && data !== null && Array.isArray((data as Record<string, unknown>)["@graph"])
      ? ((data as Record<string, unknown>)["@graph"] as Array<Record<string, unknown>>)
      : [data as Record<string, unknown>];

  const event = candidates.find((c) => c?.["@type"] === "Event");
  if (!event) return null;

  const location = (event.location ?? null) as Record<string, unknown> | null;
  const address = (location?.address ?? null) as Record<string, unknown> | null;
  const geo = (location?.geo ?? null) as Record<string, unknown> | null;

  // Construct a readable address line. Prefer "Street, City, Region";
  // fall back to whichever pieces exist.
  let locationAddress: string | null = null;
  if (address && typeof address === "object") {
    const parts = [
      address.streetAddress,
      address.addressLocality,
      address.addressRegion,
    ].filter((p): p is string => typeof p === "string" && p.length > 0);
    if (parts.length) locationAddress = parts.join(", ");
  }

  return {
    startsAt: typeof event.startDate === "string" ? event.startDate : null,
    endsAt: typeof event.endDate === "string" ? event.endDate : null,
    locationName: typeof location?.name === "string" ? location.name : null,
    locationAddress,
    latitude: typeof geo?.latitude === "number" ? (geo.latitude as number) : null,
    longitude: typeof geo?.longitude === "number" ? (geo.longitude as number) : null,
    description: typeof event.description === "string" ? event.description : null,
  };
}

export async function fetchLumaEventMeta(
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LumaEventMeta | null> {
  const url = `https://luma.com/${encodeURIComponent(slug)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: {
        // Browser-like UA — Luma serves the JSON-LD-bearing HTML to browsers.
        // Some servers send a stripped page to non-browser User-Agents.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const html = await res.text();
  return parseLumaEventJsonLd(html);
}
