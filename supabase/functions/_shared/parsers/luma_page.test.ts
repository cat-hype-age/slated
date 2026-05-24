// luma_page.test.ts
//
// Tests for the Luma public-event-page parser. Vitest syntax.
//
// Run targeted:
//   bunx vitest --run supabase/functions/_shared/parsers/luma_page.test.ts

import { describe, expect, it } from "vitest";
import { parseLumaEventJsonLd } from "./luma_page.ts";

// Helper: build a minimal HTML doc with a JSON-LD script tag carrying the
// given object. Mirrors the shape Luma actually serves.
const htmlWith = (jsonLd: unknown) =>
  `<!DOCTYPE html><html><head><script type="application/ld+json" data-next-head="">${JSON.stringify(jsonLd)}</script></head><body>...</body></html>`;

describe("parseLumaEventJsonLd", () => {
  it("extracts startDate, endDate, location, and geo from a single Event object", () => {
    const html = htmlWith({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "Yacht Party - #NYTechWeek",
      startDate: "2026-06-07T14:00:00.000-04:00",
      endDate: "2026-06-07T18:00:00.000-04:00",
      location: {
        "@type": "Place",
        name: "Pier 83 Midtown",
        address: {
          "@type": "PostalAddress",
          streetAddress: "Pier 83 Midtown",
          addressLocality: "New York",
          addressRegion: "New York",
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: 40.7626847,
          longitude: -74.0014928,
        },
      },
      description: "The fifth annual NY Tech Week Closing Yacht party is here!",
    });

    expect(parseLumaEventJsonLd(html)).toEqual({
      startsAt: "2026-06-07T14:00:00.000-04:00",
      endsAt: "2026-06-07T18:00:00.000-04:00",
      locationName: "Pier 83 Midtown",
      locationAddress: "Pier 83 Midtown, New York, New York",
      latitude: 40.7626847,
      longitude: -74.0014928,
      description: "The fifth annual NY Tech Week Closing Yacht party is here!",
    });
  });

  it("walks @graph arrays to find the Event entry", () => {
    const html = htmlWith({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "Tavern Community" },
        {
          "@type": "Event",
          name: "Some Event",
          startDate: "2026-06-01T10:00:00Z",
          endDate: "2026-06-01T12:00:00Z",
        },
      ],
    });

    const result = parseLumaEventJsonLd(html);
    expect(result?.startsAt).toBe("2026-06-01T10:00:00Z");
    expect(result?.endsAt).toBe("2026-06-01T12:00:00Z");
  });

  it("handles JSON-LD top level as an array", () => {
    const html = htmlWith([
      { "@type": "WebSite" },
      {
        "@type": "Event",
        name: "Array-form Event",
        startDate: "2026-07-01T12:00:00Z",
      },
    ]);
    expect(parseLumaEventJsonLd(html)?.startsAt).toBe("2026-07-01T12:00:00Z");
  });

  it("returns null when the page has no JSON-LD script tag", () => {
    expect(
      parseLumaEventJsonLd("<html><body>nothing here</body></html>"),
    ).toBeNull();
  });

  it("returns null when the JSON-LD has no Event @type", () => {
    const html = htmlWith({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Just an org",
    });
    expect(parseLumaEventJsonLd(html)).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(
      parseLumaEventJsonLd(
        `<script type="application/ld+json">{ not valid json }</script>`,
      ),
    ).toBeNull();
  });

  it("handles missing location/geo gracefully (online events)", () => {
    const html = htmlWith({
      "@type": "Event",
      name: "Online Event",
      startDate: "2026-08-01T10:00:00Z",
    });
    const result = parseLumaEventJsonLd(html);
    expect(result?.startsAt).toBe("2026-08-01T10:00:00Z");
    expect(result?.locationName).toBeNull();
    expect(result?.locationAddress).toBeNull();
    expect(result?.latitude).toBeNull();
    expect(result?.longitude).toBeNull();
  });

  it("partial address: only locality + region, no street", () => {
    const html = htmlWith({
      "@type": "Event",
      name: "Vague Location Event",
      startDate: "2026-09-01T10:00:00Z",
      location: {
        "@type": "Place",
        name: "Somewhere in Brooklyn",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Brooklyn",
          addressRegion: "New York",
        },
      },
    });
    expect(parseLumaEventJsonLd(html)?.locationAddress).toBe(
      "Brooklyn, New York",
    );
  });
});
