# Final manual test checklist

Run this checklist after deployment with disposable test data and each intended role. Record any failure, account, booking reference, time, and environment in the release log. These scenarios have not been executed as part of Phase 14.

1. **Authentication** — Register/verify a Client, log in through the unified form, recover a password by OTP, change a temporary password, and confirm role-specific access and logout.
2. **Client booking** — Add a vehicle, select services and an available slot, review the quote, submit an online booking, and confirm the booking says Awaiting Downpayment without an official reservation.
3. **Downpayment** — Upload actual payment proof for the required 50%; check it remains submitted without a receipt or reserved slot until verification. Try a rejected proof and resubmission.
4. **Staff verification** — Verify the downpayment; confirm booking becomes Pending, the slot is officially reserved, and a Downpayment Receipt is available. Check duplicate or unavailable slot handling.
5. **Confirmation and check-in** — Have Staff confirm and check in the vehicle; cover an operational walk-in and its different entry path.
6. **Mechanic workflow** — Assign a Mechanic, open the active job, update notes/checklist and evidence, and advance through service steps.
7. **Additional work** — Request extra work, review its price as Staff, approve and decline separate requests as Client, and mark approved work performed. Confirm declined or unperformed work is absent from final charges.
8. **Final inspection** — Complete service and inspection, then move to Ready for Release; verify the displayed state still says the vehicle awaits release.
9. **Invoice and final payment** — Review the locked Final Service Invoice, submit final payment proof, verify it as Staff/Admin, and inspect Final Payment Receipt and Full Payment Receipt at the correct stages. Check rejected proof produces no receipt.
10. **Release** — Check a balance blocks release. When fully paid, check eligibility is shown but status remains Ready for Release until Staff/Admin explicitly releases it; then confirm Completed and release actor/time.
11. **Service history** — Confirm the completed job appears for the right Client with historical services, totals, and document access.
12. **Maintenance** — Confirm reminders appear for eligible completed work and link to a valid booking choice.
13. **Reports** — Compare Admin operational/financial totals and filters with the test records; confirm no submitted or rejected payment is counted as verified revenue.
14. **Archive** — Archive/restore eligible users, vehicles, and services; check active selection changes while retained history and financial documents remain readable.
15. **Security and IDOR** — Try cross-client vehicle, booking, proof, receipt, invoice, and history IDs; confirm denial. Check role-only actions and invalid upload types/sizes.
16. **Production integrations** — Check `/api/health`, login and a browser deep link, configured HTTPS/CORS, Cloudinary proof/evidence/PDF access, and SMTP OTP/document delivery.
