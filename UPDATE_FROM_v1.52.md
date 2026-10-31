# COPKU v1.53 — attachment links and author editing

This update-only package requires a complete v1.52 orchestra website.

## Installation

1. Codex must first confirm installation of the connected orchestra Supabase migration `discussion_author_edits_v153`. It adds author-only editing permissions and server-managed edit timestamps. Do not deploy the website update while that installation is pending. The SQL file is included for review; do not run it again after Codex confirms installation.
2. Back up your complete v1.52 website folder.
3. Copy the contents of the ZIP's inner `COPKU_v1.53_Update_Only` folder into the complete website folder, replacing matching files and retaining the rest.
4. Deploy the entire merged folder to Netlify. This small update ZIP cannot be deployed by itself.
5. Hard-refresh the website after deployment: Ctrl+Shift+R (Windows) or Command+Shift+R (Mac).

No new secrets, buckets, Edge Functions, email or Stripe settings are required.

## Changes

Attachment download links now fit the filename and size label. The blank space to the right is outside the link. Download names and score Preview buttons keep working.

Authors have an Edit button on their own notification or reply. They can change text, change a notification's subject, retain or remove current attachments, and add new files. The combined limit remains eight files, each up to 10 MB. Save commits the changes; Cancel discards the draft.

The database enforces author-only content editing, including for administrator accounts. Administrators retain their existing pin and delete controls. The author, creation time, notification identity and reply target cannot be changed through the editor. An Edited time is shown after a content change, while the original posting time is retained. Pinning alone does not mark a post as edited.

A stale edit from another tab is rejected rather than overwriting a newer version. Failed saves retain the editor and attempt to clean up only new, unreferenced uploads. Editing does not create another reply notice. An unfinished reply and its selected files survive saving an edit in the same discussion.

## Validation

Isolated PostgreSQL checks passed for owner and non-owner edits, administrator pin/content separation, immutable fields, server timestamps, stale edits, attachment checks, and nonmember/anonymous access. UI checks passed for author controls, text/files, attachment removal, Cancel, preserved reply drafts and existing notice behavior. Existing v1.52 attachments, moderation controls, unread/contact behavior and score Preview links passed regression checks.

Managed browser visual testing was unavailable in this environment; the attachment link CSS was reviewed and the edit flows were exercised through UI integration tests. No test fixtures were written to live member data.
