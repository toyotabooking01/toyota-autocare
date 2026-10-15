# Toyota AutoCare

Toyota AutoCare is a MERN application for vehicle service booking, workshop operations, billing, and after-sales records. It is a release candidate pending final manual QA.

## Technology stack

- Client: React, Vite, React Router, MUI, Axios
- API: Node.js, Express, MongoDB with Mongoose
- Integrations: Cloudinary for uploaded images and financial PDFs; Nodemailer with SMTP for OTP and document email

## Roles and features

| Role | Main capabilities |
| --- | --- |
| Client | Dashboard, vehicles, online booking, bookings, additional-work decisions, service history, maintenance reminders, profile and settings |
| Staff | Operational bookings, walk-ins, check-in, payment verification, additional-work pricing review, job coordination, transactions, vehicle release |
| Mechanic | Assigned jobs, active work, notes and checklist, additional-work requests, recording approved work as performed |
| Admin | Dashboards and monitoring, Staff and Mechanic actions, customers and vehicles, services, schedules, bays, reports, archive |

Unified login, role access, OTP recovery, and temporary-password change support the account flows. Role-specific navigation is defined in `client/src/app/navigation.js`; account settings are available through the profile menu.

## Core workflow

Online booking moves through Vehicle → Services → Date & Time → Review → Downpayment → Confirmation. Submitting proof does not reserve a slot. Staff/Admin verification of the required 50% downpayment moves a booking from `awaiting_downpayment` to `pending` and establishes its official reservation. Staff then confirm and check in the vehicle. A Mechanic performs the service and may request additional work; Client approval and recorded performance are required before that work enters final billing. Final inspection leads to Ready for Release, where the final invoice total is locked. Verified final payments reduce the balance. Full payment makes the vehicle eligible for release; Staff/Admin must explicitly release it to complete the booking. Service history and maintenance reminders follow the completed service.

Financial documents are distinct immutable snapshots: Downpayment Receipt after verified downpayment, Final Service Invoice at billing lock, Final Payment Receipt after a verified final payment, and Full Payment Receipt once the locked total is fully paid. Submitted or rejected payments have no receipt. Archived records are soft archived; historical bookings, payments, receipts, invoices, and job orders remain available.

See [System Overview](docs/SYSTEM_OVERVIEW.md) for the state and document map.

## Project structure

- `client/`: React app, pages, components, API client, and Vercel SPA rewrite
- `server/`: Express routes, controllers, services, models, scripts, and checks
- `shared/`: shared project assets and reference data
- `docs/`: architecture, manual QA checklist, and release notes

## Local setup

Use Node.js 24 LTS and npm, a reachable MongoDB database, and two terminals. Run these commands from the repository root:

```powershell
cd server
npm ci
Copy-Item .env.example .env  # Only if .env does not exist
# Set local values in .env, then:
npm run dev
```

```powershell
cd client
npm ci
Copy-Item .env.example .env.local  # Only if .env.local does not exist
npm run dev
```

The API defaults to port 5000 and the Vite app to port 5173. `GET /api/health` checks the API process. Use `npm run seed:toyota` in `server/` explicitly to populate the Toyota catalog and diagnostic service; `npm run verify:toyota` and `npm run audit:toyota-images` inspect that data. `npm run check:cloudinary` pings the configured Cloudinary account. `npm run bootstrap:admin` creates the first Admin using `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PHONE`, and `BOOTSTRAP_ADMIN_PASSWORD` supplied locally. It refuses an existing Admin. `npm run bootstrap:dev-users` and `npm run seed:demo` are development-only opt-in scripts that require `NODE_ENV=development` and locally supplied `DEV_ADMIN_*` and `DEV_MECHANIC_*` account values; the demo seed also requires `DEMO_CLIENT_*` and creates demo vehicles, services, bays, and schedules. It creates no bookings or job orders. Existing eligible demo data is kept when rerun. No seed runs at API startup. The development Admin email used by the dev bootstrap is `admin@toyota.com`; its password is configured locally or provided separately. Never reuse demo credentials in production.

## Environment variables

Copy the examples in `server/.env.example` and `client/.env.example`; they contain no credentials. Keep real values in ignored local files or the host's secret settings.

| Scope | Variables |
| --- | --- |
| Server secrets | `MONGO_URI`, `JWT_SECRET`, `OTP_HASH_SECRET`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_API_KEY`, `SMTP_USER`, `SMTP_PASS`, optional `CARAPI_TOKEN`, `BOOTSTRAP_ADMIN_PASSWORD`, `DEV_ADMIN_PASSWORD`, `DEV_MECHANIC_PASSWORD`, `DEMO_CLIENT_PASSWORD` |
| Server configuration | `NODE_ENV`, `PORT`, `CLIENT_ORIGIN`, `JWT_EXPIRES_IN`, `OTP_EXPIRY_MINUTES`, `CLOUDINARY_CLOUD_NAME`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `EMAIL_FROM`, `EMAIL_DELIVERY_ENABLED`, `EMAIL_DIAGNOSTICS`, `OTHER_SERVICE_ESTIMATED_DURATION_MINUTES`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PHONE`, `DEV_ADMIN_EMAIL`, `DEV_MECHANIC_EMAIL`, `DEMO_CLIENT_EMAIL` |
| Client public | `VITE_API_URL` only; it must point to the API `/api` base URL |

Do not put secrets in any `VITE_*` variable. Use independent random values of at least 32 bytes for the JWT and OTP secrets. Cloudinary stores payment proofs, service evidence, and generated financial PDFs. SMTP sends OTP, temporary account credentials where applicable, and financial documents.

## Production deployment

Deploy `server/` as a persistent Node service with `npm ci` and `npm start`, a production MongoDB URI, independent auth secrets, and an exact HTTPS `CLIENT_ORIGIN`. Set the Cloudinary and SMTP variables for their respective functions. Production startup validates required database, origin, and auth configuration; it does not seed data. Run catalog seed or first Admin bootstrap separately when needed.

Deploy `client/` as a Vite build, for example on Vercel with root directory `client/`, build command `npm run build`, and output directory `dist`. Set the public `VITE_API_URL` to the deployed backend's HTTPS `/api` URL at build time. `client/vercel.json` rewrites SPA routes to `index.html`. Keep the backend origin and the client API URL aligned, then check `/api/health`, login, a deep link, uploads, and email in the deployed environment.

## Security and release checks

The API enforces role and ownership checks, server-authoritative financial totals, payment verification, archive constraints, and upload validation. Browser navigation is presentation only. Keep `.env` files untracked and protect production secrets in the hosting environment.

Implementation is frozen for manual review. Follow the [Manual Test Checklist](docs/MANUAL_TEST_CHECKLIST.md) and record deployment findings in [Release Candidate Notes](docs/RELEASE_CANDIDATE.md). Historical phase documents in `docs/` are retained as design context; use the System Overview for current behavior.
