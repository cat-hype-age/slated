# Google Cloud OAuth setup for Gmail access

This is the one-time setup needed before per-user "Connect Gmail" can work in
Slated. Estimated time: 10 minutes. You're creating a builder-owned OAuth
client that Slated users will authorize so we can read their Luma confirmation
emails on their behalf.

You'll end up with two values to hand back: `GOOGLE_OAUTH_CLIENT_ID` and
`GOOGLE_OAUTH_CLIENT_SECRET`.

## 1. Create or pick a Google Cloud project

1. Go to <https://console.cloud.google.com/>.
2. Project picker (top bar) → **New Project**. Name it something like
   `slated-oauth`. Skip organization. Create.
3. Make sure that project is selected in the project picker before continuing.

## 2. Enable the Gmail API

1. Left nav → **APIs & Services → Library**.
2. Search **Gmail API** → click it → **Enable**.

## 3. Configure the OAuth consent screen

1. Left nav → **APIs & Services → OAuth consent screen**.
2. User type: **External**. Create.
3. App information:
   - App name: `Slated`
   - User support email: your email
   - Developer contact: your email
4. App domain: leave blank for now (we can fill the published URL later).
5. Authorized domains: add `lovable.app` and `supabase.co`.
6. Save and continue.
7. **Scopes** step → **Add or remove scopes** → search for
   `gmail.readonly` → check it → Update. Save and continue.
8. **Test users** step → **Add users** → add every email of every dogfood-week
   participant (15 people incl. you). External + unverified app = only listed
   test users can sign in. Save and continue.
9. Back to summary → leave the app in **Testing** mode for now. We don't need
   to submit for verification before TechWeek.

## 4. Create the OAuth client

1. Left nav → **APIs & Services → Credentials**.
2. **Create credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Slated web client`.
5. **Authorized redirect URIs** → Add URI. Paste exactly:
   ```
   https://pmskzzxpwehcvuxejrbt.supabase.co/functions/v1/google-oauth-callback
   ```
6. Create.
7. Google shows a modal with **Client ID** and **Client secret**. Copy both.

## 5. Hand the values back

Paste the two values into the secret prompt that Lovable will surface next, or
reply with them in chat and Lovable will store them. Names:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

## Notes

- Test users list is the gate during dogfood week. Anyone not on that list will
  see "Access blocked: Slated has not completed Google verification" and won't
  be able to connect.
- After TechWeek, if we want to open this to more users, we submit for
  verification (security review, ~weeks). Not required for Phase 2.
- The redirect URI must match exactly, including the project ref. If it
  doesn't, Google returns `redirect_uri_mismatch` on the callback.
