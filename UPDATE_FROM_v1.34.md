# COPKU Website v1.35

Upload the complete contents of `COPKU_Website_v1.35` to the main Orchestra website, replacing the previous website files. Keep the complete `portal/score-preview/vendor` folder from v1.34. The separate email website does not need an upload.

The live Orchestra Supabase upgrade is already configured. No manual database, bucket, Cron, Stripe or Brevo setup is needed for this release. The recorded migration is `20261029093234_resources_and_recurring_tasks_v135`, with the readable SQL in `supabase/portal/13_resources_and_recurring_tasks_v135.sql`. The updated `portal-booking` function is live as version 6. Do not run the SQL again on this already-updated project. When installing into a different project, apply the earlier setup files first, then this SQL and the complete updated `portal-booking` function.

## Resources

Choose Booking, a category, then Add resource or open a resource and choose Resource settings. Enter its ID and name. IDs are entered by the administrator and must be unique across the inventory. Existing resources keep their current booking records and show an unassigned ID until an administrator fills it in.

Choose up to eight PNG, JPG, WebP or GIF images and eight attachments. Each file can be up to 10 MB. Selected and existing files have Remove controls; saving records the remaining selection. Images appear in the resource detail page, where members can open them and download attachments. Files stay in a private bucket and are served through short-lived links after member authentication. Booking clearance continues to control who can book each resource.

## Recurring reminder tasks

In Initiate new task, set the first start/end time and choose Repeat: Every day, Every number of hours or Every number of days. Each later occurrence uses the same duration, content, attachment, selected recipients and mandatory/urgent flags. The first start should be today or later. Completing or declining one occurrence does not change the next one.

The database checks due occurrences every minute, including while the portal is closed. Starts follow the original schedule, rather than the time the worker happens to run. After a scheduling interruption, missed occurrences are created in bounded batches with their original dates and durations.

In Sent tasks, Stop repeating prevents future occurrences. Existing tasks remain in their current states. Withdraw applies only to that particular occurrence. A stopped series is labelled accordingly.

## Pages and replies

Tasks, notifications, replies and each resource category default to 20 items per page. Choose 50 or 100, use the page number, or use the navigation arrows. The chosen page size is remembered for that type of list. Opening a detail page and returning keeps the current list page.

Reply divider lines separate messages. Parent quotes remain readable even when their original reply is on another page. Clicking an unread reply notice opens the page containing that reply; only notices for the displayed reply page are marked read. New replies open the last page. Badge totals and portal search include every authorized record, rather than only the current page.

## Validation

Verified the live database using rollback-only fixtures: repeat intervals and exact durations, independent receipts, duplicate submission/worker prevention, stopping, protected system tasks, authenticated and denied function access, unique resource IDs, stale edits, unauthorized file paths, private Storage settings and active Cron. Model and actual portal-controller tests cover pagination, more than 1,000 retrieved records, cross-page reply notices, media selection/removal and signed detail display. Existing portal UI checks through v1.34 pass.

The managed browser-preview service is unavailable in this environment. Browser visual verification remains limited by the private preview's ChatGPT sign-in requirement.
