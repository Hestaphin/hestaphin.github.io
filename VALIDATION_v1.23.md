# COPKU v1.23 validation

Passed: JavaScript/handler syntax, portal render and action smoke checks, search filters and About-style control behavior, minute-resolution task dates, notification file boundaries, demo task/chat/approval actions and 5 MB blob storage, and shop handler tests for prices, cart quantities, origin restrictions, request reuse, ownership checks and signed webhooks.

Live checks: Club approval column exists and the existing applicant remains pending; private notification bucket caps files at 5 MB minus one byte; shop table RLS and service-only payment/secret access confirmed; database payment mismatch/unpaid/replay/paid-state and upload boundary tests passed with test rows rolled back; live price health returned ready/USD500; signed harmless webhook probe returned HTTP 200. No real charge or new customer registration was made.

Original v1.19 assets and public pages are preserved except the shop purchase text and scripts. The shared About/Events stylesheet and filter model remain unchanged. ZIP packaging checks all included bytes.

Browser visual QA remains unverified because the managed preview supervisor was unavailable. A real signed-in administrator still needs to review the waiting applicant. Automatic approval review rejected changing the separate Club membership checkout JWT setting; that live setting remains unchanged.
