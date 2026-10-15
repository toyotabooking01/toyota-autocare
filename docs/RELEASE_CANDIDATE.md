# Release candidate notes

**Status: Implementation Complete — Pending Manual QA.** Phase 14 freezes the implementation for final review. The application includes four role workflows, online and walk-in booking, 50% verified downpayment reservation, workshop and additional-work approval, locked final billing, verified final payment, explicit fully-paid vehicle release, immutable financial documents, after-sales history/reminders, reports, soft archive, security hardening, and deployment preparation.

The API and client are configured by environment variables. Catalog and account seeds are explicit commands; production startup performs no automatic seed. Local secrets belong in ignored `.env` files or host settings. Current setup and deployment instructions are in [README](../README.md); the state and document map is in [System Overview](SYSTEM_OVERVIEW.md).

## Pending acceptance

Live MongoDB behavior, Cloudinary delivery, SMTP delivery, role-by-role manual workflows, production integration checks, and a real deployment smoke test remain to be performed by the project team using [Manual Test Checklist](MANUAL_TEST_CHECKLIST.md). Record defects and release decisions here after that review. No production deployment or manual business scenario is claimed by this document.

The client build currently emits a non-blocking bundle-size advisory for the main JavaScript chunk.
