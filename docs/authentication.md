# Phase 3A: backend authentication

Implemented in the existing Express API. No React auth pages, booking controllers,
public staff registration, refresh-token feature or user-management feature is added.

## Changed files

Created:

- `server/config/auth.js`
- `server/controllers/authController.js`
- `server/routes/authRoutes.js`
- `server/middleware/authenticate.js`, `authorize.js`, `rateLimit.js`
- `server/services/authService.js`, `otpService.js`, `emailService.js`, `tokenService.js`, `bootstrapAdmin.js`
- `server/utils/HttpError.js`, `authValidation.js`, `safeUser.js`
- `server/scripts/bootstrap-admin.js`, `auth-integration.js`
- `server/tests/auth.test.js`
- `docs/authentication.md`

Modified:

- `server/app.js`, `server/middleware/errorHandler.js`
- `server/models/User.js`, `server/models/EmailOtp.js` (auth-related fields only)
- `server/.env.example`, `server/package.json`
- `docs/api-contract.md`, `docs/model-relationships.md`, `README.md`

No packages were installed. The Atlas DNS workaround, connection configuration,
booking models/logic, capacity design, archive policy and frontend were preserved.

## Setup

Keep secrets only in ignored `server/.env` or the process environment. Copy missing
keys from `.env.example` without overwriting the existing Atlas configuration.

| Setting | Requirement |
| --- | --- |
| `JWT_SECRET` | Independent random secret of at least 32 bytes; never a sample phrase. |
| `JWT_EXPIRES_IN` | Default `1h`; positive integer followed by s/m/h/d, at most 24 hours. |
| `OTP_HASH_SECRET` | Separate random secret of at least 32 bytes for keyed OTP and reset-token digests. |
| `OTP_EXPIRY_MINUTES` | Default 5; integer 1–15. Applies to each OTP and, separately, each verified reset grant. |
| `BREVO_SMTP_HOST` | `smtp-relay.brevo.com` by default. |
| `BREVO_SMTP_PORT` | 587 by default with required STARTTLS; 465 (TLS) and 2525 (STARTTLS) supported. |
| `BREVO_SMTP_USER` | SMTP login from Brevo, not a role or application user's email. |
| `BREVO_SMTP_PASS` | Brevo SMTP key, not an API key. |
| `EMAIL_FROM` | Verified sender, for example `Toyota AutoCare <verified-sender@example.com>`. |

Generate independent random values locally using Node's
`crypto.randomBytes(32).toString('hex')`; keep the output private. Do not commit
it or put it in a VITE_ variable. The API does not generate persistent secrets
automatically. Missing/invalid auth configuration fails relevant routes with 503,
while health endpoints remain available. Login/me need JWT configuration; OTP
operations need the OTP secret. Mail-issuing routes also need SMTP configuration.

During Phase 3A validation, Atlas was connected. A local JWT_SECRET was present
but did not pass the configuration strength check and must be replaced with a
strong random secret. OTP_HASH_SECRET and all Brevo settings were absent.
Tests generated ephemeral process-only secrets
and intercepted email, leaving local `.env` unchanged. Real Brevo delivery remains
pending. After setting up a verified sender, use an address you control for a real
registration/verification/recovery smoke test before connecting the React UI.

See [Brevo SMTP setup](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP)
for SMTP login/key configuration. The recovery design follows the single-use,
expiry and throttling guidance in the
[OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Implemented API

All paths below start with `/api/auth`. Bodies are JSON objects. Responses use
`Cache-Control: no-store`. Passwords, OTP digests, reset-token digests and internal
counters never appear in response profiles.

| Method/path | Request | Success |
| --- | --- | --- |
| POST `/register` | fullName, email, phone, password; optional confirmPassword | 201 `{ message, user }`. Public input is allowlisted; role is always client and emailVerified is false. No access token until verified login. |
| POST `/verify-email` | email, otp (six-character numeric string) | 200 `{ message }`; consumes OTP and marks client verified atomically. |
| POST `/resend-verification` | email | 202 generic `{ message }`; eligible unverified clients receive a new code if cooldown allows. |
| POST `/login` | email, password | 200 `{ accessToken, tokenType: "Bearer", expiresIn, user }`. Role comes from the current database account. Other input fields cannot select a role. |
| GET `/me` | `Authorization: Bearer <accessToken>` | 200 `{ user }`. |
| POST `/forgot-password` | email | 202 generic `{ message }` for existing, unknown or ineligible accounts. Calling again after cooldown resends and invalidates earlier reset codes/grants. |
| POST `/verify-reset-otp` | email, otp | 200 `{ message, resetToken, expiresIn }`. Consumes code; issues an opaque reset grant, not an access JWT. |
| POST `/reset-password` | email, resetToken, newPassword; optional confirmPassword | 200 `{ message }`. Atomically consumes grant, hashes password and revokes existing access JWTs. Log in again afterward. |

The user profile contains id, fullName, normalized email, phone, role, emailVerified
and status; a mechanic also receives their own employeeId, specialization and
availability. It never uses an unrestricted document spread.

Errors: 400 for invalid input/code/reset grant; 401 for invalid credentials or
missing/invalid/expired/revoked access token; 403 for valid credentials belonging
to an unverified client, or a forbidden role; 409 for reserved registration email;
429 for request throttling; 503 for unavailable DB/configuration/mail. Unexpected
errors return a generic 500 without stack, driver messages, credentials or tokens.

Email verification before login is required for clients. Archived or inactive
users cannot log in or use existing tokens. Unverified clients use the verification
flow first; password recovery is available to verified clients and active staff.
Registration rejects emails reserved by any role or archived record; it never
silently replaces, restores, promotes or edits an existing account.

## Password and OTP rules

- Passwords require at least 12 characters and no more than 72 UTF-8 bytes to
  prevent bcrypt truncation. Confirmation is request-only, not a model field.
  Passwords are never trimmed; bcrypt uses cost 12. Login uses a dummy bcrypt
  comparison when the email is unknown, with the same invalid-credential response.
- OTPs use `crypto.randomInt` across the six-digit range, preserving leading zeros.
  Only an HMAC-SHA256 digest bound to email and purpose is stored. A keyed digest
  prevents offline enumeration of six-digit codes from a database-only disclosure.
  Resend avoids repeating the immediately preceding code.
- Each challenge allows five submitted valid-format verification attempts.
  Failed attempts are committed; success consumes the code. A fifth failed attempt
  marks it used. Expiry is checked in application queries, independently of TTL.
- Issuance has a persisted 60-second per-email/per-purpose cooldown. Ineligible,
  unknown and cooldown-limited recovery/resend calls use the same 202 response.
  A new challenge invalidates all earlier challenges and reset grants of that
  purpose, without affecting the other purpose.
- Issuing, verifying and resetting write the account's hidden `otpSequence` counter
  inside a transaction. This serializes concurrent operations on the same account;
  conflicting transactions retry before deciding which OTP/grant is current.
  The counter is not an authorization claim. No plaintext OTP goes to MongoDB or
  normal application logs. The six digits appear only in the outbound email.
- A correct reset OTP yields 32 random bytes encoded as a 64-character hex token.
  Only its keyed digest is stored in hidden `EmailOtp.resetTokenHash`. `isUsed=true`
  keeps the original OTP consumed; `expiresAt` now bounds the separate reset grant.
  Email alone, an OTP without verification, or an access JWT cannot reset a password.
- Reset consumes the grant and changes the password in one transaction, increments
  hidden `User.authVersion`, and invalidates other reset codes/grants. Concurrent
  use admits one successful reset. There is no automatic login after reset.

## JWT and role middleware

Access tokens use HS256 with fixed issuer `toyota-autocare` and audience
`toyota-autocare-api`; verification pins algorithm, issuer and audience. Claims
include sub (User ID), role, version, tokenUse, issued-at and expiry. No password,
email, phone or OTP is included. Authentication loads the current User on every
request and checks status, archival, client verification and authVersion. A JWT's
role claim is informational: authorization uses the current database role.

Future feature routes can use:

```javascript
router.get('/staff-resource', authenticate, authorize('admin', 'mechanic'), handler);
```

The same helper supports each individual role. Role permission is only the first
check; future controllers still need the documented vehicle/booking ownership
checks. No demonstration feature endpoints were added.

There is no refresh token or server logout endpoint in this phase. Client-side
logout will discard the token; password reset or secret rotation revokes existing
tokens. Archive/inactive status blocks tokens while that state applies. A future
UI should keep access and reset tokens in memory and never put them in URLs.

## Rate limits and email failures

There are per-IP limits of 120 auth requests, 30 login requests, and 20 combined
registration/resend/forgot requests per 15 minutes. Exceeding a limit returns 429
with Retry-After. The memory maps are bounded and expired buckets are removed.
Express trust proxy remains disabled, so arbitrary forwarded IP headers are not
trusted. This is suitable for the current single-process development server;
before deployment with multiple instances, use shared rate-limit storage and a
reviewed proxy configuration. Database OTP attempt limits/cooldowns already work
across instances. Generic recovery responses do not claim identical SMTP timing;
a durable delivery queue is a future production improvement.

The Nodemailer service requires encrypted SMTP, has connection/socket timeouts,
disables protocol logging, and exposes only safe delivery errors. SMTP is outside
retryable transactions. If registration mail fails after database commit, the
unverified account remains reserved, the failed code is invalidated, and the API
returns 503. Fix delivery then use resend; do not register the account again.
Recovery/resend delivery failures still return the generic 202 and invalidate the
failed code. Missing SMTP configuration returns 503 uniformly before account lookup.

## Explicit initial admin bootstrap

There is no public admin or mechanic creation endpoint. Only when an initial
admin is required, set temporary process variables `BOOTSTRAP_ADMIN_NAME`,
`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PHONE`, `BOOTSTRAP_ADMIN_PASSWORD`, then
run `npm run bootstrap:admin` from `server/`. Use a private prompt/password manager
to supply the password rather than putting it literally in shell history. Clear
these variables afterward. The script loads the existing Atlas connection, validates
input, bcrypt-hashes the password and creates a verified admin. The trusted operator
must confirm ownership of that email out of band.

Run bootstrap once, not concurrently. It refuses if any admin already exists
(including archived admins) or the email is reserved. It never promotes an existing
user, prints credentials or runs during server startup. Bootstrap was tested only
in an isolated test database; no real admin was created. Mechanic creation stays
in the later authenticated Admin/User Management phase.

## Validation and data safety

From `server/`:

```powershell
npm test
npm run test:integration
npm run test:auth:integration
```

33 offline tests pass, including the original 20 model tests. The existing Atlas
suite still passes. The auth Atlas suite covers registration/hash/role protection,
OTP expiry and attempt limits, resend and concurrency, unified login, JWT/me,
archived/inactive accounts, RBAC, reset expiry/replay/races, password and JWT
revocation, bootstrap refusal, mail failures and connected health endpoints.

Both integration suites use internally generated `tac_<uuid>` databases, never
the configured application database. The auth suite overrides secrets in its
process and intercepts the email service in memory; there is no production
mail-bypass configuration or OTP-returning endpoint. Finally blocks check the
exact generated name and permitted collection names, remove temporary collections
and verify none remain. All integration records, including temporary admins and
mechanics, were removed. No real application records or local secrets were edited.

The backend also started normally with the existing Atlas configuration. Both
health endpoints returned HTTP 200/database connected on temporary port 5001;
missing credentials returned 401 and invalid local JWT configuration returned
503 as intended. The validation server was stopped afterward. Git checks found
no tracked secret environment files or configured secrets in candidate source files.

The API implementation is ready for Phase 3B UI integration after replacing the
weak JWT secret, adding OTP/Brevo configuration, and completing a real mailbox
smoke test.
