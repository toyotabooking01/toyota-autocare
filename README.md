# Toyota AutoCare

Toyota AutoCare is a university MERN project for vehicle service booking and
workshop operations. React, MUI, React Router, and Axios run in `client/`;
Express, CommonJS, Mongoose, and MongoDB Atlas run in `server/`.

## Prerequisites

- Node.js 24 LTS and npm
- A MongoDB Atlas cluster, database user, and network access for your IP
- Two terminals for the backend and frontend
- Brevo SMTP credentials and a verified sender only when testing email delivery

## Server setup

```powershell
cd server
npm ci
Copy-Item .env.example .env  # Only if .env does not already exist
npm run dev
```

Configure `server/.env` before starting. The server loads that file regardless of
the terminal's working directory. Store real secrets there; it is ignored by Git.
Set `MONGO_URI` to the Atlas connection string, including the application database
name. The local Windows setup uses Cloudflare DNS for Atlas SRV lookups. Set
`JWT_SECRET` and `OTP_HASH_SECRET` to independent random values of at least 32
bytes. `PORT` defaults to `5000`; `CLIENT_ORIGIN` defaults to
`http://localhost:5173`. `GET /` and `GET /api/health` show database status.

Registration and password recovery use Brevo SMTP when email delivery is enabled.
Configure `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SMTP_USER`,
`BREVO_SMTP_PASS`, and `EMAIL_FROM` with the verified sender to test real email.
Brevo currently has a provider-side queue/account issue in this development
environment. SMTP acceptance alone does not confirm delivery; check Brevo logs
and the mailbox before presenting the OTP flow.

For local development without email, set the following **only in `server/.env`**:

```ini
NODE_ENV=development
EMAIL_DELIVERY_ENABLED=false
DEV_AUTO_VERIFY_EMAIL=true
```

Newly registered Clients will be verified automatically and can sign in. This
bypass is disabled by default and ignored in production. To restore the normal
flow, set `DEV_AUTO_VERIFY_EMAIL=false` and `EMAIL_DELIVERY_ENABLED=true`, then
configure Brevo. No OTP or password is exposed to the browser.

## Client setup

```powershell
cd client
npm ci
Copy-Item .env.example .env  # Optional, only if .env does not already exist
npm run dev
```

Open `http://localhost:5173`. `VITE_API_URL` defaults to
`http://localhost:5000/api`; set it in `client/.env` if the API origin changes.
All `VITE_` values are public browser configuration, so never put secrets there.
Restart Vite after changing its environment file. If Vite uses another port,
update `CLIENT_ORIGIN` in `server/.env` and restart the server.

On Windows PowerShell installations that block `npm.ps1`, use `npm.cmd` in place
of `npm` for these commands.

## Development users and demo data

Public registration creates **Client** accounts only. For development Admin
and Mechanic accounts, set `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`,
`DEV_MECHANIC_EMAIL`, and `DEV_MECHANIC_PASSWORD` in `server/.env`, then run:

```powershell
cd server
npm run bootstrap:dev-users
```

Passwords must be at least 12 characters and at most 72 UTF-8 bytes. The
bootstrap is development-only, verified/active, and does not overwrite an
existing email. `npm run bootstrap:admin` is a separate one-time initial-Admin
option described in [authentication documentation](docs/authentication.md).

For presentation data, also set `DEMO_CLIENT_EMAIL` and
`DEMO_CLIENT_PASSWORD`, then run:

```powershell
cd server
npm run seed:demo
```

The development-only seed creates missing Admin, Mechanic, and Client accounts,
a Toyota vehicle, three services, two service bays, and six future schedule
slots. It keeps existing matching records and refuses conflicting or ineligible
ones; rerunning it does not reset records. It never creates Bookings, Job Orders,
notifications, or payment data. Use the Client and Admin UI to create the
transactions you want to show. **Do not run demo seeding in production.**

## Roles and core workflow

- **Client:** register/login, add a vehicle, select one or more services and an
  available schedule, submit an online Booking, view or cancel eligible
  Bookings, read notifications, and view maintenance recommendations.
- **Admin:** manage services, bays, mechanics, and schedules; confirm online
  Bookings or create Walk-In Bookings; check in a Client; assign an eligible
  Mechanic and Bay; review Job Orders; approve final inspection, release, and
  completion; view reminders and operational reports.
- **Mechanic:** see only assigned Job Orders, start service, save notes and
  checklist items, and submit the work for final inspection.

The demo menu shows working sections only. Planned Profile, Archive, dedicated
Service History, and dedicated Completed Jobs pages remain outside this release;
completed visits are still visible in My Bookings and My Jobs.

The normal Booking path is `pending → confirmed → checked_in →
mechanic_assigned → in_service → final_inspection → ready_for_release →
completed`. Assignment creates one Job Order per Booking. Completion keeps
history, releases the Mechanic and Bay, and creates configured maintenance
reminders. Online and Walk-In Bookings share atomic schedule capacity logic.
No payment collection or financial ledger is implemented; report price totals
are estimates based on current Service catalog prices.

## Checks and documentation

```powershell
cd server
npm test
cd ../client
npm run build
npm run lint
```

Backend tests are offline. Atlas integration scripts are separate, explicit
commands; they use disposable databases and are not needed for routine UI
development. See the [API contract](docs/api-contract.md),
[model rules](docs/model-relationships.md), and
[authentication details](docs/authentication.md) for implementation notes.
