# Phase 2.5 model relationships and enforcement plan

These model decisions began in Phase 2.5. Booking, assignment, schedule, and
completion rules are now implemented in services and controllers. See
[the API contract](api-contract.md) for the current endpoints and
[authentication details](authentication.md) for the identity layer.

## Relationships

| Record | References and cardinality |
| --- | --- |
| User | One users collection; role is client, mechanic or admin. |
| Vehicle | One owner User with role client. A client may have many vehicles. |
| Booking | One client, one owned vehicle, one Schedule, and one or more distinct Services. Optional mechanic User and ServiceBay until assignment. |
| Schedule | Many bookings may reference one date/time slot, within capacity. Booking date/time are server-derived snapshots. |
| JobOrder | Exactly one Booking reference, uniquely indexed: a booking has zero or one JobOrder. Also references mechanic and bay. Checklist describes work across all services in the visit. |
| MaintenanceReminder | One client, vehicle and individual service. A completed multi-service visit may produce multiple reminders, using each service's configured interval. |
| Notification | One recipient User. |
| EmailOtp | Normalized email, not a User reference, so future pre-registration verification remains possible. Ephemeral hashed security record. |

Booking keeps all approved statuses and both `online` and `walk-in` channels.
Adding services does not create multiple job orders. A booking reserves one
capacity unit regardless of service count in this phase. Duration-aware bay or
mechanic scheduling is a separate future decision; slot capacity alone does not
prove that a mechanic or bay is free for the entire visit.

## Where business rules belong

| Rule | Schema/database enforcement | Controller/business enforcement |
| --- | --- | --- |
| Client role | Required User ObjectId | Load client; require role client and eligible account before new bookings. Derive identity from the authenticated requester unless admin creates a walk-in. |
| Vehicle ownership | Required Vehicle ObjectId | Match vehicle.owner to booking.client; reject archived vehicle for new work. |
| Selected services | Required nonempty array of distinct, non-null Service ObjectIds | Fetch all IDs and require matching count, isActive=true and isArchived=false. Recheck on service changes. |
| Schedule | Required Schedule ObjectId | Require enabled slot; derive bookingDate/bookingTime from it; atomically reserve capacity. Date/time of a referenced Schedule must not be edited independently of bookings. |
| Mechanic | Optional User ObjectId | At assignment require role mechanic, status active, isArchived=false and availability available. Prevent simultaneous conflicting assignments. |
| Service bay | Optional ServiceBay ObjectId | Require operationalStatus=operational, isArchived=false and availability available at assignment. |
| Lifecycle | Booking enum only | Pending/confirmed/checked_in start unassigned. Assignment atomically writes both references and transitions checked_in to mechanic_assigned. From mechanic_assigned through completed both refs are required by business logic. |
| Terminal history | No TTL or destructive route | Completed bookings keep assignments. Cancellation/rejection/no-show never erases historical refs; an unassigned terminal booking may have no refs. Release active resource occupancy without deleting historical assignment IDs. |
| Job Order | Unique booking index | Create at assignment when appropriate; require mechanic/bay match the booking. Any reassignment updates both records atomically; checklist covers the visit. |
| Archive/restore | isArchived and archivedAt fields | Archive sets both fields; restore sets false/null. Reject archive that strands active work. Historical reads may populate archived masters; eligibility checks apply to new work, not to reading or preserving completed history. |

Mongoose references are not foreign keys. They neither check role/existence nor
stop concurrent state changes. Keep these database lookups and coordinated writes
in operation logic, not hidden schema hooks. Use transactions and conditional
updates for claims on scarce resources, and make archive/assignment operations use
the same state predicates so an archive cannot race with a new assignment.

## Capacity: conditional increment inside a transaction

The existing Schedule fields remain `maximumCapacity`, `currentBookingCount`, and
`isEnabled`. With maximumCapacity=3 and currentBookingCount=3, the slot is full.
An ordinary read/check/save sequence can overbook under simultaneous requests.

The implemented booking service follows this pattern (simplified illustration):

```javascript
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    const slot = await Schedule.findOneAndUpdate(
      {
        _id: scheduleId,
        isEnabled: true,
        $expr: { $lt: ['$currentBookingCount', '$maximumCapacity'] },
      },
      { $inc: { currentBookingCount: 1 } },
      { returnDocument: 'after', session },
    );
    if (!slot) throw new Error('Slot unavailable'); // Map to HTTP 409.

    // Validate role, ownership and service eligibility before committing.
    // validatedInput contains server-approved fields only.
    await Booking.create([{
      ...validatedInput,
      schedule: slot._id,
      bookingDate: slot.date,
      bookingTime: slot.timeSlot,
    }], { session });
  });
} finally {
  await session.endSession();
}
```

The predicate and increment are one atomic write. When requests contend for a
slot, only writes that still match the capacity condition can increment it.
The surrounding transaction ties that increment to booking creation; failures
roll both back. Keep transaction operations sequential and let withTransaction
handle transient retries; do not send emails or other external effects inside
its retryable callback. The integration suite verified both the concurrent
increment and rollback on Atlas. Replayed terminal transitions are rejected
without another capacity decrement.

Pending and active bookings consume one slot unit. Completed records keep their
historical reservation count. Cancellation/rejection/no-show releases a unit once:
conditionally transition from a capacity-counting status and decrement with
`currentBookingCount > 0` in the same transaction. If the status was already
terminal, do not decrement again. If rescheduling is added later, it must release
old and reserve new capacity in one transaction. Reject capacity reductions below
currentBookingCount using a conditional database update. Do not depend on query
update validators or the document-level capacity validator for concurrency safety.

## Unique indexes and retention

| Index | Decision and Atlas finding |
| --- | --- |
| User.email | Globally unique after trim/lowercase, across roles and archival. Prevents ambiguous login identities. Duplicate normalized values were rejected with code 11000. |
| Vehicle.plateNumber | Globally unique after uppercase and removing spaces/hyphens, including archived vehicles. Treat an existing vehicle as the same master record; ownership transfer needs an explicit workflow. Duplicate normalized plates were rejected. Plate reassignment/temporary plates require a later business policy. |
| User.employeeId | Required for mechanics, uppercase/trimmed. Partial unique index includes string values only; multiple users omitting the field succeeded. IDs remain reserved after archival. Future user input allowlists omit this field for clients/admins; the existing index also prevents duplicate IDs if accidentally assigned to another role. |
| JobOrder.booking | Unique: duplicate job order for the same booking was rejected. Retained cancelled/completed job orders still reserve the relationship. |
| Schedule.date + timeSlot | One capacity record per local slot; preserve existing compound unique index. |
| ServiceBay.name | Existing normalized unique bay label retained to avoid ambiguous operational assignment. |
| Service.name and profile fields | No new global uniqueness constraints. Two services with the same name persisted successfully. |

The application database's email, employeeId, plate and booking indexes were
inspected read-only; no syncIndexes, index drops or rebuilds were performed there.
Index behavior was exercised in an isolated database on the same Atlas cluster.
Unique indexes raise duplicate-key errors, not Mongoose validation errors; future
controllers should map these to HTTP 409 without exposing database internals.

Master records (User including mechanics, Vehicle, Service, ServiceBay) use
archive/restore. Bookings, JobOrders and service-history-related records are retained.
No destructive API actions or cascading deletion were introduced. Mongoose's raw
delete methods still exist; the future API and restricted database access must
honor the policy. The only TTL remains EmailOtp's ephemeral expiry cleanup.
Test cleanup is an explicit exception for isolated disposable test collections.

## Existing data and compatibility

The configured application database contained zero bookings in the read-only
pre-change review. No records needed migration and no application records were
modified by integration checks. For any other database containing old `service`
bookings, perform a reviewed additive backfill to `services: [service]`, preserving
IDs, status, timestamps and references. Resolve Schedule from the historical slot;
do not invent capacity or assignment history. Do that before saving old documents
with the new required fields. Do not hard-delete or silently discard legacy records.

## Readiness

Core models, unique indexes, secret query defaults, references, multi-service
bookings and archive persistence have passed validation and Atlas checks.
Authentication, transactional booking creation, resource ownership enforcement,
assignment, and completion workflows are implemented without changing these
model and index decisions. Reports use current Service catalog prices because
Bookings do not store historical price snapshots.
