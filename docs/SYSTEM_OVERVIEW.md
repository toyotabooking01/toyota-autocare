# System overview

## Architecture and roles

The React/Vite client calls the Express API under `/api`. Express routes delegate to controllers and services; Mongoose models persist operational records in MongoDB. The API owns authorization, prices, payment verification, and state transitions. Cloudinary stores payment proof and service evidence images plus financial PDFs. Nodemailer sends OTP, account, and financial document email over configured SMTP.

Client manages owned vehicles, online bookings, additional-work decisions, history, and maintenance. Staff handles daily bookings, walk-ins, check-in, payment verification, pricing review, and release. Mechanic performs assigned jobs and proposes extra work. Admin manages operational and catalog records, monitors activity, runs reports, and uses the archive. Authentication includes unified login, OTP recovery, and forced temporary-password change where applicable.

## Booking lifecycle

| Stage | Booking status and rule |
| --- | --- |
| Online submission | `awaiting_downpayment`; the schedule is not yet officially reserved |
| Downpayment verification | `pending`; verified 50% downpayment creates the official reservation, subject to availability rules |
| Operations | `confirmed` → `checked_in` → `mechanic_assigned` → `in_service` |
| Closeout | `final_inspection` → `ready_for_release` → `completed` |
| Other terminal states | `cancelled`, `rejected`, `no_show` |

Staff confirms and checks in a reserved booking. A walk-in enters through the operational flow without the online downpayment step. A Mechanic's additional-work request goes through Staff pricing review, Client approval or decline, and recorded performance. Only approved, performed work is billable. Final inspection precedes billing lock. Ready for Release means service is finished and the final total and invoice are locked; it does not mean the vehicle has been released. Verified payments covering that total make it fully paid and eligible for release. Staff/Admin explicitly releases the vehicle, moving it to Completed.

## Payments and financial documents

Downpayment and final-payment submissions each move to `verified` or `rejected` after Staff/Admin review. Only verified payments reduce the balance. A submitted proof is neither a receipt nor confirmation of payment. Final total is server-authoritative, with historical price snapshots rather than a later catalog price. The document sequence is:

| Document | Creation point |
| --- | --- |
| Downpayment Receipt | Verified downpayment |
| Final Service Invoice | Locked final billing at Ready for Release |
| Final Payment Receipt | Each verified final payment |
| Full Payment Receipt | Verified payments fully cover the locked total |

Financial documents are retained as immutable snapshots. They are separate from payment proof images and do not claim to be BIR Official Receipts or Invoices.

## Key records and retention

`User` carries role and account state; `Vehicle` belongs to a Client; `Service`, `Schedule`, and `ServiceBay` define offerings and capacity. `Booking` links a Client, vehicle, selected services, slot, and lifecycle. `Payment`, `Receipt`, and `Invoice` hold financial state and snapshots. `JobOrder` and additional-work records track execution. Notifications, service-history views, and maintenance reminders support after-sales use. Archive is soft archive for users, vehicles, and services. Historical bookings, payments, receipts, invoices, and job orders remain retained and readable through authorized paths.

## Deployment boundary

`server/.env.example` describes server secrets and configuration; `client/.env.example` contains only the public API base URL. Production startup validates the database, client origin, and authentication settings. Seeds and demo scripts are explicit commands. The Vercel rewrite serves client deep links; the API stays on a persistent Node service. See [README](../README.md) for setup and [Manual Test Checklist](MANUAL_TEST_CHECKLIST.md) for final acceptance.
