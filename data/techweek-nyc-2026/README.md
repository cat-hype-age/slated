# TechWeek NYC 2026 — catalog snapshot

Scraped event data from <https://www.tech-week.com/calendar/nyc>, organized by track.
This is the discovery dataset that powers Phase 5's TechWeek a16z surface (find new
events to RSVP to, not yet on your calendar).

## Files

| Track | Slug | Events | Note |
|---|---|---|---|
| AI + Infra | `ai-infra.json` | ~47 | |
| Hackathons | `hackathons.json` | 32 | |
| Fintech | `fintech.json` | 26 | |
| Founders | `founders.json` | ~44 | **Partial** — WebFetch truncated at Wed AM; later days missing |
| Investors | `investors.json` | 38 | |
| Engineers | `engineers.json` | ~47 | |
| GTM | `gtm.json` | 23 | |
| Students | `students.json` | 20 | |

## Row shape

```json
{
  "title": "Anthropic Founder Salon: Inside the AI-Native Era",
  "day": "Wed Jun 3",
  "time": "1:30 PM",
  "location": "Chelsea",
  "host": "Anthropic",
  "track": "ai-infra",
  "rsvp_url": "https://partiful.com/e/titPml1Nw0DKwGl9B6CF"
}
```

- `day` and `time` are in ET (TechWeek is NYC-only)
- `location` is neighborhood-level, not exact address (the RSVP URL has the venue)
- `host` is the organizing sponsor / company (often comma-separated for co-hosts)
- `rsvp_url` is usually Partiful, sometimes Luma, occasionally a splashthat URL or `"Invite Only"` / empty

## Cross-track duplication

Many events appear in multiple tracks — TechWeek tags events into all
relevant categories. So "Stripe x a16z Supper Club" shows in ai-infra,
founders, AND investors with the same `rsvp_url`. Downstream code should
dedupe by `rsvp_url` (or by `title + day + time` for the few rows without URL)
and merge the track values into an array.

## Scrape method

The TechWeek calendar is a Next.js 14+ SPA on Webflow Cosmic hosting. The
raw HTML doesn't contain event data — it's hydrated client-side from the
`self.__next_f.push` streaming chunks. We use `WebFetch` (an LLM-backed
fetcher that renders JS) to extract structured events per track page.

URL pattern: `https://www.tech-week.com/calendar/nyc/tracks/<slug>`.

## Refresh cadence

Snapshot from 2026-05-24. TechWeek runs Jun 1-7 2026 — events may be added
or modified up to the start date. Phase 5 (or sooner if useful) will wire
this scrape into a daily cron so the discovery surface stays current.

## Caveats worth knowing

- **Founders track was truncated** — WebFetch returned only Mon-Wed AM. A
  fresh fetch with a tighter "list ALL of Thu/Fri/Sat events too" prompt
  would complete it. Filed as a follow-up.
- **No event descriptions** — only what's visible on the catalog card
  (title/time/location/host). Full descriptions live on the RSVP page;
  we'd need to fetch those individually if the UI wants them.
- **No reliable event ID** — we'll dedupe by `rsvp_url` going forward.
