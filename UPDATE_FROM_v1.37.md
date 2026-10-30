# COPKU v1.38 update

This small patch fixes two presentation issues in v1.37:

- Replies now have one separator between adjacent replies. The last reply no
  longer adds an extra line above the pagination separator.
- The floating “Try portal demo” link has been removed from the official
  homepage. It was mistakenly included in that page's source.

Copy the patch contents into your existing complete website folder, replace
matching files, and keep all other files. Upload the resulting complete
folder to your existing Netlify website. Do not upload this patch folder by
itself: it contains only the updated files.

If your existing website folder contains `portal-preview`, delete that folder
from the copy you deploy to your official website. It contains demonstration
accounts and controls, not your real portal. Real member login and data use
`portal/internal` and remain unchanged. The release packaging helper now
excludes `portal-preview` from future official release ZIPs automatically.

Refresh the homepage and portal after deploying. Use Ctrl+Shift+R on Windows
or Command+Shift+R on Mac if an old page remains cached.

No Supabase, Stripe, Brevo or email configuration is needed for this patch.
