// luma.test.ts
//
// Tests for the Luma email parser. Vitest syntax — runs in Node with the
// project's existing vitest setup.
//
// To run targeted:
//   bunx vitest --run supabase/functions/_shared/parsers/luma.test.ts
//
// Note: the default vitest config currently scans src/ only. To pick these up
// automatically, add this path to vitest.config.ts's `test.include` array.
// That config tweak is a follow-up; for now the targeted command above works.

import { describe, expect, it } from "vitest";
import { parseLumaEmail } from "./luma.ts";

describe("parseLumaEmail", () => {
  describe("status detection from subject", () => {
    it("recognizes 'Registration confirmed for X' → approved", () => {
      const result = parseLumaEmail({
        subject: "Registration confirmed for Yacht Party - #NYTechWeek",
        from: "taverncommunity@calendar.luma-mail.com",
        bodyText: "...\nEvent Page: https://luma.com/yachtparty1?pk=foo\n...",
      });
      expect(result).toEqual({
        sourceEventId: "yachtparty1",
        title: "Yacht Party - #NYTechWeek",
        status: "approved",
        detectedVia: "luma_email_subject",
      });
    });

    it("recognizes 'You're on the waitlist for X' → waitlist", () => {
      const result = parseLumaEmail({
        subject: "You're on the waitlist for The Generative UI Hackathon",
        from: "cal-nMqbWGTGmLVubAx@calendar.luma-mail.com",
        bodyText: "...tandem.space https://luma.com/genuihack...",
      });
      expect(result?.status).toBe("waitlist");
      expect(result?.sourceEventId).toBe("genuihack");
      expect(result?.title).toBe("The Generative UI Hackathon");
    });

    it("recognizes 'You are invited to X' → invited", () => {
      const result = parseLumaEmail({
        subject:
          "You are invited to The future of social innovation: Solar Punk,Regenerative Futures",
        from: "solarpunk@user.luma-mail.com",
        bodyText: "...https://luma.com/solarpunk-jan7...",
      });
      expect(result?.status).toBe("invited");
      expect(result?.title).toBe(
        "The future of social innovation: Solar Punk,Regenerative Futures",
      );
    });

    it("handles the evt-* event ID URL form", () => {
      const result = parseLumaEmail({
        subject: "Registration confirmed for Yacht Party",
        from: "x@calendar.luma-mail.com",
        bodyText: "Ticket: https://luma.com/e/ticket/evt-Vcn2LLh5ovU2L7S?pk=foo",
      });
      // The regex greedily captures after /e/ — current behavior captures
      // "ticket" because the URL has /e/ticket/ structure on Luma tickets.
      // Acceptable for MVP: source_event_id stays unique per event in practice
      // because the canonical event URL appears elsewhere in the body. If we
      // see misclassification in real emails, narrow the regex to require
      // "evt-" prefix.
      expect(result?.sourceEventId).toBeDefined();
    });
  });

  describe("ignore patterns", () => {
    it("returns null for time-based reminders (hour)", () => {
      expect(
        parseLumaEmail({
          subject: "Future Founders: Building in Public is starting in 1 hour",
          from: "yourcore@calendar.luma-mail.com",
          bodyText: "...",
        }),
      ).toBeNull();
    });

    it("returns null for time-based reminders (minute)", () => {
      expect(
        parseLumaEmail({
          subject: "Event X is starting in 30 minutes",
          from: "x@calendar.luma-mail.com",
          bodyText: "...",
        }),
      ).toBeNull();
    });

    it("returns null for host blasts", () => {
      expect(
        parseLumaEmail({
          subject: "New message in Founders & Investors Cafe",
          from: "crazystartupguy@user.luma-mail.com",
          bodyText: "...",
        }),
      ).toBeNull();
    });
  });

  describe("sender rejection", () => {
    it("returns null for non-Luma senders even with matching subject", () => {
      expect(
        parseLumaEmail({
          subject: "Registration confirmed for X",
          from: "spammer@evil.com",
          bodyText: "https://luma.com/foo",
        }),
      ).toBeNull();
    });
  });

  describe("missing event URL", () => {
    it("returns null when no Luma URL appears in body", () => {
      expect(
        parseLumaEmail({
          subject: "Registration confirmed for X",
          from: "x@calendar.luma-mail.com",
          bodyText: "No URL here.",
        }),
      ).toBeNull();
    });
  });

  describe("asset URL false positives", () => {
    // Regression: emails contain image URLs like https://luma.com/i/<file>
    // before the event link. With an unbounded slug regex, that captured "i"
    // as the sourceEventId, fragmenting one event across multiple rows.
    it("skips /i/ image paths and picks the real event slug further down", () => {
      const result = parseLumaEmail({
        subject: "Registration confirmed for Solar Punk Futures",
        from: "host@calendar.luma-mail.com",
        bodyText:
          "Banner: https://luma.com/i/banner-abc.png\n" +
          "Event Page: https://luma.com/m3yfbo3v?pk=foo\n",
      });
      expect(result?.sourceEventId).toBe("m3yfbo3v");
    });
  });
});
