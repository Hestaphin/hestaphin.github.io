COPKU v1.48 — UPDATE FILES ONLY (for complete v1.46 or v1.47)

Merge these files into your complete orchestra website folder, replacing
matching files and keeping everything else. Deploy the entire merged folder to
Netlify. Do not deploy this patch by itself. Hard-refresh with Ctrl+Shift+R or
Command+Shift+R after deployment.

Administrators may leave Email empty when creating a new member. Give the member
their username and temporary password. First-login activation remains mandatory.
An administrator can add the first email later. Email recovery requires an email;
existing email accounts keep the normal verified self-service change process.

Score page turns retain the viewed instrument and its screen position, with a
relative-position fallback when that staff is hidden. Manual scrolling takes
priority over late image or mapping responses. Existing bar/note highlighting,
click-to-play and zoom remain available. The v1.47 bar highlight is included.

Supabase is already updated. No manual SQL or Edge Function deployment is needed.
Included backend files record the installed changes; do not rerun the migration.
Read UPDATE_FROM_v1.47.md for details and verification limits.
