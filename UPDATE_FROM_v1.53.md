# COPKU v1.54 — compact notifications and categories

This update-only ZIP requires a complete v1.53 orchestra website.

## Installation

1. Wait for Codex to confirm installation of the connected orchestra Supabase migration `notification_categories_v154`. The SQL is included for review. Do not run it again after installation is confirmed.
2. Back up your complete v1.53 website folder.
3. Copy the contents of the ZIP’s inner `COPKU_v1.54_Update_Only` folder into that complete folder. Replace matching files and retain all other files.
4. Deploy the entire merged folder to Netlify. This small update ZIP cannot be deployed by itself.
5. Hard-refresh the website after deployment: Ctrl+Shift+R (Windows) or Command+Shift+R (Mac).

No new Edge Functions, secrets, buckets, email or Stripe settings are needed.

## Layout and categories

The notification panel starts with a smaller gap below the tabs. New notifications and Post a notification use the same 48-pixel bar height as Booking. List rows have smaller text, less padding and lighter horizontal separators.

Category appears before Subject. Choose Announcement, Resource, Score, Social or Other when posting. The same choice is available in the author’s Edit window, and the selected category appears on the discussion detail page.

The category filter shares the pagination row with Items per page. It works together with search, displays the filtered count, and resets to the first page when changed. Page size preferences and pinned-first sorting are retained. Controls wrap on narrow screens while the table can scroll horizontally.

Existing notifications receive Other. Their subjects, text, attachments and original posting times are retained. Authors can change those categories through Edit. Category changes follow the existing author-only rules, including for administrators; administrators retain pin and delete controls. A category-only edit is marked Edited and does not create a new reply notice.

Both English and Chinese labels are included: 公告、资源、乐谱、社交、其他.

## Validation

Category creation/editing, category filters combined with search and pagination, page resets, filtered counts, empty results, and language labels passed UI integration checks. Isolated PostgreSQL tests passed for all five categories, legacy defaults, invalid values, author ownership, edit timestamps and admin-pin separation. Existing author editing, attachment replies, moderation, shared pagination, contact indicators and score Preview links passed regression checks.

No test fixtures were written to live member data. Browser visual verification depends on the managed preview environment; if unavailable, Codex reports that limitation with delivery.
