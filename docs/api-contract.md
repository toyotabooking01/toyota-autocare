# API route map

The Express API mounts these resource groups under `/api`. Authentication, role authorization, ownership checks, and state validation apply within their routes and services; callers must use the actual endpoint contract in the route/controller source for request bodies and allowed transitions.

| Base path | Purpose |
| --- | --- |
| `/api/health` | Process health |
| `/api/auth` | Registration, login, OTP verification/recovery, account session |
| `/api/people` | Customer and Staff account operations |
| `/api/mechanics`, `/api/vehicles` | Mechanic and vehicle management |
| `/api/services`, `/api/service-bays`, `/api/schedules`, `/api/toyota` | Catalog, capacity, availability, Toyota data |
| `/api/bookings` | Online and walk-in bookings, operational progression, payments and release |
| `/api/job-orders`, `/api/additional-work` | Workshop execution and extra work review/approval |
| `/api/receipts`, `/api/invoices` | Authorized immutable financial documents |
| `/api/notifications`, `/api/maintenance-reminders`, `/api/service-history` | Engagement and after-sales records |
| `/api/reports`, `/api/archive` | Admin reporting and soft archive |

The client uses `VITE_API_URL` as the public `/api` base URL. See [System Overview](SYSTEM_OVERVIEW.md) for the business state map and [README](../README.md) for configuration. Historical API design details are preserved in Git history.
