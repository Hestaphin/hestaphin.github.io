# COPKU v1.32 — 2026-10-25

The left portal navigation now has **Email / 邮箱** immediately below **Booking / 预约**. It opens the separate email website at `https://email.pkuco.org/`. The URL can be changed in `config.js` under `COPKU_EMAIL_URL`.

The email system is delivered separately as `COPKU_Email_v1.0.zip`, with its own frontend, Supabase backend source and Netlify setup guide. Upload this orchestra package to the existing orchestra website. Deploy the email package's `public` folder to a separate Netlify project.

The separate email app uses the existing Orchestra administrator account, with its own login session. Login tokens are not passed through the portal link. Mailbox access currently requires the administrator role. The email app shares the existing Supabase project but uses separate private tables and a separate private attachment bucket; it does not replace the portal Contact feature.

Current Supabase mail tables and functions are installed by this update. Brevo credentials, the actual sending/receiving addresses, inbound routing and the Netlify domain still need activation as described in the separate email guide. Examples in that guide are not newly created email accounts.

The manual `pg_net` repair was completed and verified on 25 October 2026. The historical optional repair file now performs a read-only check, avoiding an unnecessary reinstall.

Previous orchestra features and all original v1.19 paths/assets remain included.
