# Toyota AutoCare: REST API contract and future plan

Phase 8B implements `GET /`, `GET /api/health`, authentication, Services,
Service Bays, Mechanics, client Vehicles, Schedules, Online Bookings, Walk-In
Bookings, Admin Check-In, assignment, the controlled JobOrder workflow, in-app
Notifications, Maintenance Reminders, and operational reports. Other
resource groups below remain plans for later phases.
See [authentication API and setup](authentication.md) for exact request/response
bodies, OTP/reset behavior, JWT/RBAC, bootstrap, configuration and test results.
Outbound email uses the generic SMTP settings documented in
[authentication API and setup](authentication.md), configured for Mailjet.
The development-only auto-verification switch is documented in the README.
See [model relationships and capacity rules](model-relationships.md) for the
enforcement plan and tested atomic capacity example.

## Conventions and ownership

- JSON requests/responses. IDs are MongoDB ObjectId strings. API errors use
  `{ "message": "..." }`. Use 200 for reads/actions, 201 for creation, 400 for
  invalid input, 401 for unauthenticated requests, 403 for denied actions,
  404 for missing resources, 409 for duplicates/capacity/workflow conflicts,
  and 429 for throttled OTP/auth requests.
- Planned list queries: `page` (default 1), `limit` (default 20, maximum 100),
  and explicit resource filters. Responses: `{ items, page, limit, total }`.
  Detail/create/action responses contain the resource object.
- Server derives client identity from authentication, never trusts a client-supplied
  role or owner. A client sees only their own records. A mechanic sees assigned
  work and the minimum associated vehicle/client details required for that work.
  Admin manages operational records. Ownership checks also apply to nested refs.
- Normal master-record lists exclude archived records. Admin may explicitly query
  `isArchived=true`. Historical references remain readable under the same ownership
  rules, including references to archived users, vehicles, services, and bays.
- Use explicit input/output field allowlists. Passwords, OTP hashes, and internal
  notes must never appear in public output. `select: false` is defense in depth,
  not a replacement for response serialization or authorization.
- No destructive DELETE routes. Master archive/restore actions set both
  `isArchived` and `archivedAt` (restore clears the date). Reject archive actions
  that would strand active work with 409. Archive never cascades to history.
  Booking/job-order cancellation changes status and retains the record.

## Resource groups

| Group | Methods/actions | Access and ownership |
| --- | --- | --- |
| `/api/auth` (implemented) | `POST /register`, `/login`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/verify-reset-otp`, `/reset-password`; `GET /me` | Registration always creates a client. Login supports the three roles. OTP/reset requests are rate-limited and recovery/resend use generic responses. No public admin/mechanic registration. |
| `/api/users` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `POST /:id/archive`, `POST /:id/restore` | Admin lists/manages users and creates mechanics or walk-in clients. Clients/mechanics may read and edit their own contact profile through a restricted allowlist. Role, status, verification, employee ID and archive changes are admin-controlled. Initial admin provisioning remains a separate secured setup task. |
| `/api/mechanics` (implemented) | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `POST /:id/archive`, `POST /:id/restore` | Admin only. Creates User records with role mechanic; unfinished assignments block archive. |
| `/api/vehicles` (implemented) | `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `POST /:id/archive`, `POST /:id/restore` | Client only, limited to their own vehicles. Server derives owner from the authenticated account. |
| `/api/services` (implemented) | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `POST /:id/archive`, `POST /:id/restore` | Admin only for catalog management. Client booking service choices come from `/api/bookings/options`. |
| `/api/bookings` (implemented) | `GET /options` (Client service choices), `GET /`, `GET /:id`, `POST /` (Client online booking), `POST /:id/cancel` (Client owner or Admin), `POST /:id/confirm`, `POST /:id/reject`, `POST /:id/check-in`, `GET /assignment-options`, `POST /:id/assign` (Admin); `GET /walk-in/options`, `GET /walk-in/clients?search=`, `GET /walk-in/clients/:clientId/vehicles`, `POST /walk-in` (Admin) | Client reads only own bookings. Admin creates Walk-In bookings, checks in confirmed bookings, and assigns checked-in bookings. Mechanic reads assigned work through Job Orders, not the Booking API. No arbitrary status update route. |
| `/api/schedules` (implemented Phase 6A) | `GET /available` (Client), `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `PATCH /:id/enabled` (Admin) | Client sees only enabled, future slots with remaining capacity. Admin changes future slots safely. Booking count is server-maintained. No archive field or deletion route exists. |
| `/api/service-bays` (implemented) | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `POST /:id/archive`, `POST /:id/restore` | Admin only. Occupancy changes through later assignment/completion logic, not direct client input. |
| `/api/job-orders` (implemented through Phase 7B) | `GET /`, `GET /:id` (Admin all, Mechanic own); `GET /active`, `PUT /:id/work`, `POST /:id/start`, `POST /:id/final-inspection` (Mechanic own); `POST /:id/ready-for-release`, `POST /:id/complete` (Admin) | Creation is through Admin Booking assignment. Each action checks its exact prior Booking and JobOrder stage. Clients have no access. No arbitrary status route. |
| `/api/notifications` (Phase 8A) | `GET /`, `GET /unread-count`, `PATCH /:id/read`, `PATCH /read-all` | Client reads and marks only their own notifications. Events are created by workflow transitions; no client creation or delete route. |
| `/api/maintenance-reminders` (Phase 8A) | `GET /` | Client sees only their own recommendations; Admin has read-only access. Mechanic has no access. No email, SMS, or status mutation in this phase. |
| `/api/reports` (Phase 8B) | `GET /summary?from=YYYY-MM-DD&to=YYYY-MM-DD` | Admin only. Read-only booking, service, mechanic, and bay aggregates for scheduled visit dates. Default range is the last 30 Manila dates; maximum span is 367 inclusive dates. No report CRUD collection. |

EmailOtp is internal to `/api/auth`; there is no public OTP CRUD endpoint.

Phase 6A list responses use `{ items }`; detail and mutation responses use
`{ item }`. The booking form sends only `vehicle`, a nonempty `services` array,
and `schedule`. The server derives `client`, `bookingType=online`, date/time,
and `status=pending`. Capacity is reserved with a conditional Schedule increment
inside the booking transaction. Rejection or cancellation from pending, and
cancellation from confirmed, release one reservation in the same transaction.
Repeated or invalid transitions return 409 without another decrement. Booking
prices are displayed as estimates from current Service records; the Booking
schema has no price snapshot. Historical detail population includes archived
Vehicle and Service records.

Phase 6B uses the existing Booking `bookingType` values `online` and `walk-in`.
Admin Walk-In creation accepts an existing Client ID, owned Vehicle ID, distinct
active Service IDs, and an eligible Schedule ID. The server validates all
references and forces `bookingType=walk-in`, `status=confirmed`. Online booking
remains `status=pending`. Both sources use the same atomic Schedule reservation
and Booking transaction. `POST /api/bookings/:id/check-in` is Admin only and
changes only `confirmed -> checked_in`; it neither changes Schedule capacity
nor creates assignments or Job Orders. Admin Client lookup returns only ID,
name, and email; vehicle lookup returns only current vehicles owned by that
Client.

Phase 7A adds Admin-only `GET /api/bookings/assignment-options` and
`POST /api/bookings/:id/assign` with `{ mechanic, serviceBay }`. Assignment is
valid only for an unassigned `checked_in` Booking. In one transaction the
Booking changes to `mechanic_assigned`, an eligible available Mechanic becomes
busy, an operational available Service Bay becomes occupied, and one pending
JobOrder is created. The unique JobOrder booking index and conditional Booking
update prevent duplicate assignment. Unfinished JobOrders block reuse of either
resource. `GET /api/job-orders` and `GET /api/job-orders/:id` are read-only:
Admin sees all; Mechanic sees only orders assigned to their user ID. Client has
no JobOrder access. JobOrder responses populate only selected public fields.

Phase 7B starts service with `mechanic_assigned -> in_service` and JobOrder
`pending -> in_progress`. The assigned Mechanic may edit only `mechanicNotes`
and `serviceChecklist` while Booking is `in_service`, then request
`in_service -> final_inspection`. Admin moves `final_inspection ->
ready_for_release -> completed`. JobOrder stays `in_progress` through inspection
and release because its schema has no separate statuses for those stages; on
completion it becomes `completed` and records `completedAt`. Each transition
updates Booking and JobOrder in one transaction. Completion also releases the
Mechanic from `busy` to `available` and Service Bay from `occupied` to
`available` in that transaction. Historical references and notes remain intact.

Phase 8A creates one in-app Client notification for each successful Booking
transition from confirmation through completion, including rejection and
cancellation. Walk-In creation produces the initial confirmation notification.
The notification write shares the Booking/JobOrder transaction and uses a unique
`bookingId:status` event key, so failed or replayed actions cannot create extra
events. Client notification reads and read-state updates are owner-scoped.
Completion upserts one current MaintenanceReminder per Client, Vehicle, and
Service using that Service's `maintenanceReminderInterval` in days. A null
interval disables automatic scheduling and closes a prior pending reminder for
that service. Reminder updates share the completion transaction and do not send
email or SMS. Booking and JobOrder history remains unchanged.

Phase 8B reports count Bookings by status, source, and scheduled date and
summarize service selections, mechanic workload, and service bay usage in the
chosen range. Completed-service totals use the **current** Service catalog
`estimatedPrice` for completed Bookings. Bookings have no historical price
snapshot or payment record, so this figure is an estimate, not revenue or a
financial ledger. The response contains aggregate counts and names only;
client identities, credentials, and authentication fields are excluded.
Dashboard metrics reuse existing role-scoped Booking, JobOrder, Vehicle,
Notification, Reminder, Mechanic, and Service Bay read endpoints.

## Booking workflow proposal

Normal path: `pending -> confirmed -> checked_in -> mechanic_assigned ->
in_service -> final_inspection -> ready_for_release -> completed`.
Admin controls confirmation, check-in, assignment, final approval and release;
assigned mechanic may request `in_service` and `final_inspection`.
`cancelled`, `rejected`, and `no_show` are retained terminal outcomes. Rejection
is from pending; no-show is from confirmed after the slot; cancellation after
check-in requires an admin decision. Terminal records cannot be reopened by a
generic update. These transition rules require approval and controllers later;
the current schema only enforces membership in the approved status list.

Creation example:

```json
{
  "vehicle": "<vehicle-id>",
  "services": ["<service-id-1>", "<service-id-2>"],
  "schedule": "<schedule-id>",
  "concern": "Routine inspection"
}
```

The server sets client, online booking type, and bookingDate/bookingTime from
the selected Schedule. The services array must contain at least one distinct ID;
empty, duplicate, null or invalid IDs are rejected. Only admin may supply a client
for a walk-in. Assignment uses `{ mechanic, serviceBay }` and validates active,
unarchived records, the mechanic role, bay operation, and concurrent availability.

## Data decisions and enforcement boundaries

- One `users` collection with exactly `client`, `mechanic`, and `admin`. No Customer
  collection. Vehicle owner, booking client, and reminder client reference User
  with role client; assigned mechanics also reference User with role mechanic.
  Mongoose refs validate ID shape, not existence or role: future controllers must
  load targets and validate role, ownership, archive and active status.
- Email is trimmed/lowercased and uniquely indexed across all users, including
  archived users. Mechanic employee IDs are required and uniquely indexed when
  strings are present; omit the field for other users. `availability` is relevant
  to mechanics only. Account status is distinct from archival.
- `password` stores only a bcrypt hash. Implemented auth code validates the password
  before cost-12 hashing and explicitly selects the hash only for login. Public
  responses use a safe profile allowlist. Hidden authVersion revokes JWTs after
  password reset; hidden otpSequence serializes account OTP transactions.
- Plates are uppercase, stripped of spaces/hyphens, 4–10 alphanumeric characters,
  uniquely indexed including archived vehicles. This intentionally supports more
  than a single plate format; temporary/unregistered plates need a later policy.
  Mileage is whole kilometers; transmission is manual, automatic, or cvt.
- Service duration is whole minutes; estimated price is PHP and nonnegative.
  Reminder interval is a positive whole number of days, or null for no reminder.
  Calendar-month or mileage-based intervals need explicit extension if required.
- Booking and Schedule use real `YYYY-MM-DD` calendar dates and 24-hour `HH:mm`
  local times in Asia/Manila. Event timestamps such as startedAt/completedAt and
  reminder dates use MongoDB Date values (UTC instants). Future code must convert
  local slots explicitly when calculating instants and estimated completion.
- One or more services per booking; at most one job order per booking (unique
  index). The job order checklist covers the complete visit across all services.
  Schedule is a required reference; date/time fields are snapshots of that slot.
  Each selected service can independently produce a maintenance reminder using
  its own configured interval; MaintenanceReminder keeps its singular service.
  A walk-in
  still requires a client user and vehicle; passwordless guests are not modeled.
- Each Schedule is unique by date/time. Its count represents capacity-reserving
  bookings. Proposed rule: pending and all active statuses reserve capacity;
  completed history retains its slot count; cancellation/rejection/no-show release
  it once. Controllers must reserve/release slots and create/change bookings in
  an atomic transaction with a conditional capacity update to prevent overbooking.
  Rescheduling must release the old slot and reserve the new one in the same
  transaction. Document validation alone does not prevent concurrent overbooking.
- A bay is assignable only if operational, available and not archived. Assignment
  must atomically keep booking, job order, mechanic and bay state consistent.
- JobOrder stores a concern snapshot and checklist; it references retained booking,
  mechanic and bay records. Mutable service price/name fields are not historical
  invoices: add agreed price/service snapshots before financial reporting.
- Reminder statuses: pending, sent, dismissed, completed. Notification types:
  booking, job_order, maintenance_reminder, system. JobOrder statuses: pending,
  in_progress, completed, cancelled. These additional enums are foundation choices
  to review against detailed workflows before implementing endpoints.
- EmailOtp stores a keyed SHA-256 digest as 64 lowercase hex characters, purpose,
  expiry, attempts and used status. Implemented auth keeps its hashing secret
  server-side, enforces expiry/five-attempt limits, invalidates superseded codes,
  and atomically consumes successful codes. Password-reset verification replaces
  the consumed code's expiry with a short-lived reset-grant expiry and stores only
  hidden resetTokenHash. This grant is single-use and is never an access JWT.
  A TTL index cleans up expired OTPs only; TTL cleanup is asynchronous and is
  not a validity check. This ephemeral security-record exception never applies
  to users, bookings, job orders or service history.
- Master records have archive fields; historical transactions have no destructive
  routes or TTL. No delete/cascade logic is added. Mongoose's built-in delete methods
  and direct database access are not blocked by these schemas; future code review,
  access controls and API design must preserve the archive policy.
- Unique constraints require MongoDB indexes and produce duplicate-key errors,
  not Mongoose validation errors. Map them to HTTP 409. Index creation, persistence,
  populate queries, transaction rollback and duplicate conflicts passed isolated
  Atlas integration checks in Phase 2.5. No existing application indexes were rebuilt.
- Cross-field validators here run on documents. Future updates should load the
  document, apply allowed changes and call `save()` for full validation. Do not
  assume `runValidators` on query updates enforces cross-field or reference rules.

## Phase 2.5 verification

`cd server; npm test` runs offline Node test-runner checks of all ten models,
normalization, required fields, enum/range/date validation, secret serialization,
archive ID retention, multiple-service validation and consistent reference names.
All 20 offline tests passed; they do not write database data.

`npm run test:integration` explicitly runs Atlas checks in an internally generated
temporary database. All ten models were created; duplicate email, plate, employee
ID and job-order booking writes were rejected; references populated correctly;
archive/restore retained history. Eight simultaneous slot reservations admitted
exactly three, and a transaction failure rolled back both booking and slot count.
Cleanup removed all temporary collections and verified none remained. See the
README for isolation and cleanup details. The configured application database had
zero bookings during the pre-change review, so no legacy migration was needed.
