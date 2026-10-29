COPKU v1.36 — UPDATE FILES ONLY
For an existing v1.35 website. This is a small layout patch, not a full website package.

1. Extract this ZIP.
2. Open the extracted COPKU_v1.36_Update_Only folder.
3. In your existing website folder, overwrite these four matching files, keeping their paths:

   portal/booking.css
   portal/internal/index.html
   portal-preview/index.html
   release.json

Keep the other existing files in those folders. Publish the website as you normally do.
The HTML files use a new stylesheet URL, so browsers will request the updated CSS.

Changes:
- Correct all seven resource-table column widths, including ID and Current user.
- Prevent header text from stacking one letter per line and making a large grey bar.
- Use smaller booking tabs, page heading, table text and page controls.
- Keep table scrolling available on narrow screens.

No Supabase, database, email, Stripe or server-function setup is needed.
