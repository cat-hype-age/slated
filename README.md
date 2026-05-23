# Slated

Event coordination for tech-week and conference seasons. Merges fragmented RSVP statuses across Partiful, Luma, and TechWeek (a16z) into one navigable schedule.

> Built and dogfooded during NYC TechWeek 2026, starting May 23, 2026. This repo is public so people can follow along — commit cadence reflects active dogfood, not polish. Phase prefixes (`phase-1:`, etc.) tag where in the build a commit lands.

## Why this exists

If you're going to a week with 20+ events across multiple RSVP platforms, you face:

- **Status fragmentation.** Partiful shows "On the List / Waitlist / Pending / Interested" in its UI, but the iCal export only flags `[Pending]` — the rest collapse into one indistinguishable bucket downstream. Luma sends rich status via email but doesn't surface it in any cross-event view. TechWeek (a16z) has the discovery layer but no RSVPs.
- **No cross-platform filter.** You can't ask "show me only what I'm confirmed for" or "show me what needs my action."
- **Manual cognitive load.** Three apps, three inboxes, no single answer to "where am I at?"
- **Hedging gets punished.** The natural strategy when host approval is uncertain is to RSVP to multiple events per slot and let approvals settle. Existing tools treat double-booking as a conflict, forcing premature commitment.

Slated is built around the hedge: **pending overlaps are intentional, not bugs.** Once an RSVP lands, Slated helps you collapse alternatives using preferences set at conflict time.

## How it works

| Source | Signal | Method |
|---|---|---|
| **Luma** | Status + full event data | Gmail OAuth + subject-line parsing (`Registration confirmed for X`, `You're on the waitlist for X`, `You are invited to X`) |
| **Partiful** | Status (heuristic) | iCal hourly poll + diff on `[Pending]` tag and `LOCATION:` field. Real address replacing "Location available once Approved" signals approval; tag gone + still gated signals waitlist |
| **Partiful** | Edge-case status fixes | Manual screenshot upload (vision parse) — fallback for Interested-state changes and edge cases |
| **TechWeek a16z** | Discovery + meta-nudges | Headless catalog scrape (daily cron, shared) + Gmail watch on `hello@tech-week.com` |

All sources normalize to one event model with a real status enum: `Pending | Waitlist | Approved | Invited | Interested | Declined`.

## Stack

- **Lovable** — scaffold, iterate, deploy
- **Supabase** — Postgres, Auth (Google OAuth), Edge Functions, Storage
- **Next.js + React** (via Lovable)
- **Gmail API + Pub/Sub** for email-based status updates

## Roadmap (tentative, may slide)

- **Phase 1** — single-user iCal poll + basic schedule view
- **Phase 2** — Luma email parsing
- **Phase 3** — multi-tenant via Supabase Auth (collapsed because Lovable provides it)
- **Phase 4** — daily-useful UX (filters, "needs my action" feed, ICS export with status preserved in title)
- **Phase 5** — preference resolution UI, geo optimization, TechWeek a16z catalog discovery
- **Phase 6** — live use during NYC TechWeek (Jun 1-8), iterate on feedback
- **Post-week** — open-source cleanup

## License

MIT
