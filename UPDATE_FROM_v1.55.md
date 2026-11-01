# COPKU v1.56 — notification editor and detail styling

This update-only package requires the complete v1.55 orchestra website.

Category and Subject fields in the notification editor now use dark text on white backgrounds. Attachment Remove buttons and file-picker buttons have explicit readable colors. The same styling applies when editing replies.

Notification detail pages use smaller titles, body text, metadata, attachment links and buttons, with tighter spacing. Replies have one light divider between them. Attachment downloads still respond only on the filename link, and score Preview buttons remain separate.

## Install

1. Back up the complete v1.55 website folder.
2. Copy the contents of the ZIP's inner COPKU_v1.56_Update_Only folder into that complete folder, replacing matching files and retaining all other files.
3. Deploy the entire merged folder to Netlify, then hard-refresh the site.

Do not deploy this small ZIP by itself. No Supabase update or configuration change is needed.

Validation: notification category/filter/pagination, table-column alignment, author editing and score-preview attachment integration checks pass. Live browser visual verification is blocked by the private preview's ChatGPT sign-in; the local managed preview service is unavailable.
