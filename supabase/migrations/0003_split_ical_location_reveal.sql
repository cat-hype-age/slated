-- 0003_split_ical_location_reveal.sql
-- Split ical_location_reveal into two finer-grained values reflecting
-- confidence in the heuristic:
--   ical_location_public   → weak signal (location was just publicly visible
--                            in the iCal; user may or may not actually be
--                            approved — a public-by-default event would land
--                            here looking confident-green)
--   ical_location_revealed → strong signal (the "Location available once
--                            Approved" string flipped to a real address,
--                            meaning the host actively gave this user the
--                            details)
--
-- The old value (ical_location_reveal) is left in place as deprecated.
-- Removing it would require recreating the events and event_status_history
-- tables since both reference the enum — cost wildly outweighs benefit.
-- Old rows written before this migration keep their value and stay valid.
--
-- Note on Postgres mechanics: ALTER TYPE ADD VALUE cannot run inside a
-- transaction block alongside other DDL that *uses* the new value. These
-- two statements are safe together in one migration because nothing else
-- here consumes them — only the edge function does, and the function ships
-- in the same commit but in a separate file (TS, not SQL).

ALTER TYPE public.status_detection_method ADD VALUE IF NOT EXISTS 'ical_location_public';
ALTER TYPE public.status_detection_method ADD VALUE IF NOT EXISTS 'ical_location_revealed';
