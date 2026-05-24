// luma.ts
//
// Parse Luma email notifications to extract RSVP status changes.
//
// Luma sends from multiple sender subdomains:
//   *@calendar.luma-mail.com  — system notifications (RSVP confirms, waitlist, invites)
//   *@user.luma-mail.com      — host messages (blasts, "new message in X")
//
// Status-bearing subject patterns:
//   "Registration confirmed for {title}"             → approved
//   "You're on the waitlist for {title}"             → waitlist
//   "You are invited to {title}"                     → invited
//   "Registration for {title} has been declined"     → declined (provisional —
//                                                       Luma format unverified;
//                                                       remove pattern if wrong)
//
// Ignore patterns (return null):
//   "{title} is starting in 1 hour"                  — reminder, no status change
//   "New message in {title}"                         — host blast, no status change
//   Anything else from luma-mail.com domains         — unknown intent
//
// Pure functions, dependency-free. Same TypeScript runs in Deno (edge function)
// and Node (vitest). Don't add imports that aren't standard ESM TS.

export type LumaStatus = "approved" | "waitlist" | "invited" | "declined";

export interface LumaParsedEvent {
  sourceEventId: string;                    // Luma event slug or evt-* ID, extracted from body URL
  title: string;                            // Event name as extracted from subject
  status: LumaStatus;
  detectedVia: "luma_email_subject";
}

export interface LumaEmailInput {
  subject: string;
  from: string;
  bodyText: string;
}

const SUBJECT_PATTERNS: Array<{ re: RegExp; status: LumaStatus }> = [
  { re: /^Registration confirmed for (.+?)$/i, status: "approved" },
  { re: /^You're on the waitlist for (.+?)$/i, status: "waitlist" },
  { re: /^You are invited to (.+?)$/i, status: "invited" },
  { re: /^Registration for (.+?) has been declined$/i, status: "declined" },
];

const IGNORE_PATTERNS: RegExp[] = [
  /is starting in \d+ (?:hour|minute|day)s?/i,
  /^New message in /i,
];

// Luma event URL forms in email body:
//   https://luma.com/abc123              (slug)
//   https://lu.ma/abc123                 (short domain)
//   https://luma.com/e/evt-xyz789        (event ID form)
//   https://luma.com/abc123?pk=foo       (with tracking params — we ignore them)
//
// Slug requires ≥4 chars to skip asset paths like /i/<image>, /u/<user>,
// /a/<avatar> that appear earlier in the body. JS regex backtracks past the
// failed asset URL and finds the real event link further down.
const LUMA_EVENT_URL = /https?:\/\/(?:luma\.com|lu\.ma)\/(?:e\/)?([A-Za-z0-9_-]{4,})/;

// Match the sender to Luma's known subdomains. Reject anything else outright —
// guards against an impersonator with a similar subject line.
const LUMA_SENDER = /(?:user|calendar)\.luma-mail\.com/i;

export function parseLumaEmail(input: LumaEmailInput): LumaParsedEvent | null {
  if (!LUMA_SENDER.test(input.from)) {
    return null;
  }

  if (IGNORE_PATTERNS.some((re) => re.test(input.subject))) {
    return null;
  }

  let status: LumaStatus | null = null;
  let title = "";
  for (const { re, status: s } of SUBJECT_PATTERNS) {
    const m = input.subject.match(re);
    if (m) {
      status = s;
      title = m[1].trim();
      break;
    }
  }
  if (status === null) return null;

  const urlMatch = input.bodyText.match(LUMA_EVENT_URL);
  if (!urlMatch) return null;
  const sourceEventId = urlMatch[1];

  return {
    sourceEventId,
    title,
    status,
    detectedVia: "luma_email_subject",
  };
}
