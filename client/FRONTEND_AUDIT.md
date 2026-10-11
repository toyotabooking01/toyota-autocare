# Frontend validation and confirmation audit

This pass changes only files under `client/`. Backend source fingerprints were compared before and after implementation and were unchanged. Existing frontend validation/dialog work and unrelated backend edits were already present when this request began and were preserved. API endpoints, payload shapes, authentication behavior and database logic were not changed. All client routes, forms and mutation handlers were inventoried before editing.

## Fixes made in this pass

- Moved the frontend's existing validation rules into a client-owned module and updated all three imports. Client builds no longer require server source or Vite permission to serve a server file. Existing limits and password policy are unchanged.
- Reserved-schedule capacity checks now run even when date/time inputs are invalid, showing all relevant errors together. Required/format errors retain precedence.
- Correcting either report date clears stale related remote date errors without clearing unrelated errors or values.
- Job workflow request failures now display their error message even when the response contains a field-error object; previously these failures could be hidden.
- Expanded regression coverage for catalog/work constraints and an actual browser admin schedule flow, including invalid inputs, correction, No preserving drafts and repeated Yes clicks.

No additional confirmation component or duplicate prompts were needed: the existing reusable MUI Yes/No implementation already covers the important actions listed below and was retained and tested.

## Pages and actions audited

| Page/form | Validation | Confirmation |
| --- | --- | --- |
| Login | Existing email and password checks retained; invalid forms stop before confirmation. | Yes/No before login. Successful role redirect retained. |
| Registration | Existing name, email, Philippine mobile, password and matching-confirmation rules retained. | Yes/No before account creation. No preserves all fields. OTP redirect retained. |
| Forgot password | Email validation runs first. | Yes/No before requesting the reset code. |
| Email/reset OTP | Six-digit checks retained; malformed saved email flows redirect safely. A synchronous request lock prevents duplicate verify/resend requests. | No added prompt for verification or resend: these are explicit, time-sensitive verification actions. |
| Reset password | Existing password/confirmation rules retained; related password corrections clear stale confirmation errors. Expired grants are checked again when Yes is clicked. | Yes/No before changing the password. Automatic session cleanup remains immediate. |
| Logout | Existing auth/session logic retained. | Yes/No for the user-initiated Sign out action. |
| Vehicles | Required text, year, plate, transmission and mileage checks retained. Incomplete browser number input and nondecimal numeric strings cannot silently become zero. | Yes/No before add/update and existing archive/restore actions. Archive retains historical records. |
| Mechanics | Existing names, email, optional mobile, employee-ID, password and enum rules retained. | Yes/No before create/update; existing archive/restore confirmations use the reusable dialog. |
| Services/service bays | Existing names, description, numbers, optional interval and status rules retained. | Yes/No before create/update; archive/restore confirmations retained through the shared component. |
| Schedules | Existing date/time/capacity rules retained. Reserved date/time changes and capacity below reservations now fail inline before confirmation. Future time is rechecked on Yes. | Yes/No before create/update; existing activate/deactivate confirmation retained. |
| Online/walk-in booking | Selected IDs must still belong to loaded options; walk-in customer required; every selected service must be available; schedule must be future, enabled and have capacity. Invalid selection returns to its step before any confirmation. Time-sensitive rules are checked again on Yes. | Yes/No before final booking submission. No preserves the review selections. |
| Booking list | Existing status eligibility retained. | Cancel, confirm, reject and check-in dialogs use the reusable Yes/No component and retain their consequence text. No returns to booking details. |
| Mechanic/bay assignment | Existing required ID rules retained; selected resources must exist in the loaded available options. | Yes/No before assigning. |
| Job notes/checklist/workflow | Existing note/item lengths, item count, completion values and unsaved-work guard retained. | Yes/No before saving, removing a checklist item, starting service, final inspection, ready for release and completion. |
| Reports | Existing real-date, chronological-order and maximum-range validation retained. | None: applying a report range is a read-only filter. |
| Searches, filters, details, dashboards, reminders | Existing input constraints retained. No other editable profile, birthday or username forms exist. | None for read-only views/navigation. |
| Notifications | Existing mark-read actions inspected. | None: these low-impact actions only update read state. |

## Shared behavior

- One MUI `ConfirmationDialog` supplies accessible labeling, focus handling, Yes/No buttons, and disabled controls while processing. Existing dialogs use it directly; newly confirmed actions use `ConfirmationProvider`.
- Forms validate first. Invalid forms show field errors and never request confirmation. No, Escape and backdrop dismissal before processing do not call the action or reset fields.
- Yes executes the captured action once. A synchronous lock prevents repeated Yes clicks or another submission from starting duplicate work. Cancel/dismissal is blocked during the request.
- Navigating away cancels an unapproved pending action. Existing automatic logout on unauthorized responses and password-reset session cleanup are not intercepted.
- Existing validation rules now live in `client/src/utils/validationRules.js`. Browser-specific numeric, availability and reserved-schedule checks live in `client/src/utils/formValidation.js`.
- Field errors update as values change. Related date/time and password-confirmation errors account for changes to their companion field. Invalid browser-native number/date input receives inline feedback.

## Actions intentionally left immediate

Navigation, Home/Dashboard, View/Details, Search/Filter, report ranges, Next/Back, retries, password visibility and draft checklist additions/checkboxes remain immediate. They navigate, read data, or edit a local draft rather than commit an important change. OTP verification/resending stays direct to preserve its expiry/cooldown flow. Automatic authentication cleanup is also direct. No global unsaved-navigation guard was added; the existing job workflow guard remains.

## Client files changed in this pass

- `src/utils/validationRules.js` — new client-owned rules
- `src/utils/formValidation.js`
- `src/auth/session.js`
- `src/pages/useCatalog.js`
- `src/pages/JobOrderPanel.jsx`
- `vite.config.js`
- `tests/validation-confirmation.test.mjs`
- `tests/browser-flow.test.mjs`
- `FRONTEND_AUDIT.md`

## Existing validation/confirmation implementation retained

These files already contained frontend changes when this request began; the existing implementation was audited rather than replaced:

- `src/main.jsx`
- `src/components/AuthForm.jsx`
- `src/components/ConfirmationDialog.jsx` — new
- `src/components/ConfirmationContext.js` — new
- `src/components/ConfirmationProvider.jsx` — new
- `src/components/confirmationState.js` — new
- `src/components/useFormValidation.js`
- `src/layouts/ApplicationLayout.jsx`
- `src/pages/AuthPages.jsx`
- `src/pages/ClientVehicles.jsx`
- `src/pages/ClientBookService.jsx`
- `src/pages/AdminWalkIn.jsx`
- `src/pages/AdminMechanics.jsx`
- `src/pages/AdminMasterData.jsx`
- `src/pages/AdminSchedules.jsx`
- `src/pages/AssignmentDialog.jsx`
- `src/pages/BookingList.jsx`
- `src/pages/JobOrderPanel.jsx`
- `src/utils/formValidation.js` — new
- `tests/validation-confirmation.test.mjs` — new
- `tests/browser-flow.test.mjs` — new
- `package.json` — adds the client test command; no dependencies added
- `FRONTEND_AUDIT.md` — this report

## Verification and remaining limitations

- `npm.cmd test`: ten passing tests, none skipped: nine regression tests plus a headless Chrome interaction test. The browser test covers registration, OTP verification, login/role redirect, vehicle validation and duplicate-field errors, booking, logout and admin schedule editing; it verifies No preserves drafts and duplicate Yes clicks submit once.
- Browser tests use an isolated temporary profile and intercepted fake API responses; they never submit to the real backend. Chrome/Edge is detected on Windows, or can be supplied through `CHROME_PATH`. The browser test skips when no executable is available.
- `npm.cmd run lint` and `npm.cmd run build` pass. The existing bundle-size warning remains.
- Frontend checks cannot guarantee that availability or uniqueness has not changed on the server. Existing API error handling remains the final response to those races.
- No live backend/database testing or backend changes were performed in this pass. Not every admin dialog has a dedicated browser interaction test; their validation and confirmation mechanisms share the tested code, and their wiring was audited.
- No global unsaved-navigation/discard guard was introduced; leaving a form via normal navigation continues its existing behavior.
- Client-owned validation rules must be reviewed if the API contract changes in a future task; this pass deliberately leaves the backend untouched.
