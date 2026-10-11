# Form validation audit

Implemented on October 10, 2026. Existing layouts and workflows are preserved; changes to visible forms are validation feedback and input constraints. No dependencies were added. Existing uncommitted authentication/email changes and the earlier removal of `server/.env.example` were preserved.

## Forms and input surfaces audited

| Form | Validation added or corrected |
| --- | --- |
| Login | Shared email syntax and length checks; rejects empty/whitespace passwords and passwords exceeding bcrypt's 72-byte limit. Existing short passwords remain usable. Authentication failures stay generic to avoid account disclosure. |
| Registration | Trimmed names containing letters, 120-character limit; normalized email with local/domain validation; Philippine mobile format; existing minimum 12-character/maximum 72 UTF-8-byte password policy; rejects whitespace-only passwords; confirmation required and matching on both sides. Inline duplicate-email errors. |
| Forgot password / resend | Same email rules; existing account-enumeration protections and resend limits retained. |
| Email/reset OTP | Six digits, leading zeros retained, expired/incorrect code errors attached to the code field; errors clear as the code changes. |
| Reset password | Shared password policy and mandatory matching confirmation, including direct API requests. Reset-token checks retained. |
| Mechanic create/edit | Names, email, optional Philippine mobile, employee ID syntax and length, allowed status/availability, temporary password policy. Email and employee-ID duplicates appear next to their fields. Existing specialization-array bounds retained. |
| Vehicle create/edit | Required bounded make/model, whole model year from 1886 through next year, normalized 4–10-character alphanumeric plate, allowed transmission, bounded whole nonnegative mileage. Duplicate plates identified inline. |
| Service create/edit | Nonblank bounded name, bounded optional description, whole positive duration/reminder interval, finite nonnegative price, numeric bounds, inline name conflicts. Fixed empty create-form initialization so fields receive their intended defaults. |
| Service-bay create/edit | Required bounded name, allowed operational status, inline duplicate-name errors from the existing unique index. |
| Schedule create/edit | Real calendar date, valid 24-hour time, future date/time in Manila, bounded positive whole capacity, inline capacity/reservation/duplicate-slot conflicts. Existing atomic capacity protection retained. |
| Online and walk-in booking | 1–20 distinct services, valid vehicle/schedule IDs, selection limits shown beside services. Server errors identify the affected selection and return to its step. Existing active-client, ownership, eligible-service, future-slot and atomic capacity checks retained. |
| Mechanic/bay assignment | Valid IDs and membership in currently loaded options before submitting; backend eligibility/reservation checks retained; resource conflicts appear at the corresponding select. |
| Job notes/checklist | Optional notes capped at 5,000 characters; up to 30 checklist items, each nonblank and at most 500 characters; boolean completion state validated. Inline errors and preserved draft values. |
| Reports | Real dates, end date on or after start date, maximum 367 inclusive days; invalid ranges blocked before request, errors beside dates. Same rules enforced by API. |
| List searches/date filters | Search inputs capped at the existing 100-character server limit; invalid calendar filters blocked with inline errors. Existing server search escaping, date validation and enum allowlists retained. |
| Profile, birth dates, usernames, manually entered booking references | No editable forms/fields exist for these in the current project. Profile retrieval is read-only. Booking references are generated MongoDB IDs. No unrelated forms were introduced. |
| Notifications, reminders, archive/restore and workflow actions | Audited; no new editable data fields. Existing authorization, ownership, IDs, state transitions and chronology checks retained. |

## Backend and uniqueness

`server/utils/formValidation.mjs` is shared by the browser and API. `validateForm.js` converts its field errors to HTTP 400 responses. `HttpError` and the error middleware return an `errors` map without exposing submitted values. Existing request allowlists, database checks and transactions remain in force.

Existing email, employee-ID, plate, bay-name and schedule date/time unique indexes remain. Existing preflight checks for emails, employee IDs, plates and case-insensitive service names remain. Duplicate-key races now return field-specific HTTP 409 errors.

Services additionally receive a lowercase trimmed `nameKey` on creation or rename, backed by a sparse unique index. This closes concurrent new-service name races once the index is built, without requiring deletion or rewriting of legacy catalog records. Existing records are still checked by the case-insensitive name query.

## Optional fields and normalization

- Mechanic phone and specializations remain optional because employee ID/email identify the account.
- Service description, booking concern and mechanic notes remain optional supplemental context. There is currently no concern input in the booking UI; its API validation is retained.
- Reminder interval remains optional; null disables automatic reminders. The browser sends null for an empty interval.
- Checklist may be empty; individual items must be valid when added.
- Mileage remains optional with the existing zero default. Blank browser mileage saves as zero.
- Mechanic status/availability and bay operational status retain backend defaults when omitted; supplied values must be valid options. The existing UI provides defaults.
- Search/date filters remain optional. API report dates retain their existing default range when omitted.
- Ordinary text is trimmed before saving; emails are lowercased and employee IDs/plates retain uppercase normalization. Phone formatting is retained after outer trimming; spaces, parentheses and hyphens are ignored for Philippine mobile validation. Passwords are deliberately not trimmed, so meaningful spaces are preserved.

Numeric bounds: mileage 0–9,999,999 km; duration 1–525,600 minutes; reminder interval 1–36,500 days; capacity 1–10,000; price PHP 0–999,999,999.99. Price retains the existing allowance for fractional amounts rather than introducing a new rounding policy.

## Files modified or added for this audit

- Shared/backend utilities: `server/utils/formValidation.mjs` (new), `server/utils/validateForm.js` (new), `server/utils/authValidation.js`, `server/utils/HttpError.js`, `server/middleware/errorHandler.js`.
- Backend services/model: `server/services/authService.js`, `peopleVehiclesService.js`, `masterDataService.js`, `scheduleService.js`, `bookingService.js`, `jobOrderService.js`, `reportService.js`, `otpService.js`; `server/models/Service.js`.
- Frontend shared code: `client/src/components/useFormValidation.js` (new), `client/src/components/AuthForm.jsx`, `client/src/auth/session.js`, `client/src/pages/useCatalog.js`, `client/vite.config.js`.
- Frontend pages: `client/src/pages/AuthPages.jsx`, `AdminMechanics.jsx`, `ClientVehicles.jsx`, `AdminMasterData.jsx`, `AdminSchedules.jsx`, `ClientBookService.jsx`, `AdminWalkIn.jsx`, `AssignmentDialog.jsx`, `JobOrderPanel.jsx`, `AdminReports.jsx`, `BookingList.jsx`.
- Tests: `server/tests/formValidation.test.js` (new); valid registration fixtures in `server/tests/auth.test.js` and `server/tests/emailBehavior.test.js` now include confirmation.
- This report: `VALIDATION_AUDIT.md` (new).

## Verification and remaining limits

- Server test suite: 99 passing tests, including eight new regression tests covering invalid direct API input, shared browser rules, limits, malformed dates, confirmation bypass, field errors and the service-name index declaration.
- Client production build and ESLint pass. Vite still reports its existing large-bundle warning.
- A local Vite development-server check confirms the browser can load the shared validation module. Its filesystem allowlist only adds that shared file.
- No live database migration or browser interaction suite was run. Database-backed concurrent behavior depends on MongoDB successfully building the declared unique indexes; this audit verifies index definitions, not production index state.
- Legacy service duplicates are not deleted or backfilled. The sparse name index protects new/renamed records; historical duplicate cleanup remains a separate data migration.
- Plate rules deliberately preserve the project's existing normalized alphanumeric format, including legacy/temporary identifiers, rather than imposing a new LTO-only pattern.
- Validation confirms Philippine mobile syntax, not carrier assignment or ownership. Supported inputs are `09XXXXXXXXX`, `639XXXXXXXXX`, and `+639XXXXXXXXX`, including common separators.
- The shared ES module is required by the CommonJS API using the installed Node 24 runtime; deployments need a Node version supporting synchronous ES-module loading (Node 20.19+ or 22.12+).
