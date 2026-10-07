# Phase 3B — React authentication

The frontend now provides `/login`, `/register`, `/verify-email`,
`/forgot-password`, `/verify-reset`, and `/reset-password`, plus simple role
placeholders at `/client/dashboard`, `/mechanic/dashboard`, and `/admin/dashboard`.
The supplied mockups guide the split-panel composition, white form cards, red
accents, registration steps, OTP boxes and success states. A local SVG illustration
provides the scenic vehicle panel. No actual dashboard features are implemented.

## Local configuration

From `client/`, run `npm run dev`. The Axios default and `.env.example` both use:

```dotenv
VITE_API_URL=http://localhost:5000/api
```

If using a local client `.env`, include `/api` in this value and restart Vite after
changing it. All auth requests append `/auth/...`; do not add `/api` twice.
Run the existing backend separately. Its `CLIENT_ORIGIN` should match the Vite
origin (normally `http://localhost:5173`). If Vite selects another port, update
that backend setting or free port 5173. No backend secrets belong in VITE_ values.

## API mapping

| Screen/action | API |
| --- | --- |
| Registration | POST `/api/auth/register` |
| Verification and resend | POST `/api/auth/verify-email`, `/api/auth/resend-verification` |
| Unified login | POST `/api/auth/login`, then GET `/api/auth/me` |
| Session restoration | GET `/api/auth/me` |
| Forgot password and reset-code resend | POST `/api/auth/forgot-password` |
| Reset-code verification | POST `/api/auth/verify-reset-otp` |
| New password | POST `/api/auth/reset-password` |

No role is submitted on registration/login. Profile roles always come from the
backend. Password validation follows its 12-character minimum and 72-byte maximum,
not the sample 8-character rule in the mockups. OTP expiry comes from the email;
the UI does not assume a hard-coded expiry duration. OTP input supports keyboard
navigation, leading zeros, paste and one-time-code autofill.

## Session and routing

React context holds the current user; sessionStorage holds only the access JWT
and non-secret pending email-flow metadata/cooldown deadline. On reload, `/me`
validates the stored token before protected content renders. Invalid tokens clear
the session; temporary network/server errors show a retry screen. Axios sends
Bearer credentials and clears the session on authenticated HTTP 401 responses.
Role guards protect all paths under each role prefix; wrong-role access redirects
to the current user's dashboard. Backend authorization remains authoritative.

Logout removes the stored JWT and Authorization header. This backend has no
logout/revocation endpoint, so logout is local to this browser tab. sessionStorage
survives reloads but ends when the tab closes; it is JavaScript-readable and must
be protected from XSS. No refresh-token mechanism is introduced.

The reset grant stays in React memory only, never in URLs or browser storage.
Reloading the reset-password page requires starting recovery again. Its lifetime
uses the backend's returned expiresIn. Passwords and OTPs are not persisted.
Successful password reset clears any local signed-in session and returns to login.

Verification/resend uses a persisted 60-second countdown. Resend starts only after
an explicit click, never on page mount. The backend enforces its own cooldown and
attempt limits. Generic recovery responses are shown without claiming an unknown
email is registered. A failed registration may leave an unverified account if
mail failed; the registration page offers verification/resend rather than silently
retrying account creation. A login rejected as unverified offers the same path.

## Basic checks and manual validation

Build and lint were run; no live emails, OTP requests, accounts or backend tests
were triggered in Phase 3B. The build has a nonblocking bundle-size advisory.

Manually check registration/confirmation validation, email verification, wrong or
expired OTP, resend cooldown, unverified-login recovery, duplicate registration,
forgot-password and single-use reset grants. Then check each role redirect using
existing authorized accounts, wrong-role URLs, reload restoration, expired-token
handling, logout, network failures, mobile layout and keyboard/OTP paste behavior.
Full browser accessibility and end-to-end behavior remain for manual validation.
