COPKU v1.44 — UPDATE FILES ONLY

Supports the complete v1.40, v1.41, v1.42 or v1.43 orchestra website.
1. Extract the ZIP.
2. Copy contents of COPKU_v1.44_Update_Only into your complete website folder.
   Replace matching files; retain all other website files.
3. Deploy the MERGED COMPLETE folder to Netlify, not this patch alone.
4. Hard-refresh the portal with Ctrl+Shift+R or Command+Shift+R.

SUPABASE IS ALREADY UPDATED. No manual database, bucket or function setup.
The separate email website is unchanged.

START AS ADMIN:
Material -> Uniform -> Uniform data -> Add type under each classification.
Add an optional image, measurement columns and sizes; fill every measurement
for every size, then save.
My uniforms -> Group templates -> Add template -> choose member groups and
permitted types -> Save template.
Only assigned types can be requested by each member.

MEMBER:
Material -> Uniform -> application form -> Newly apply / Exchange -> type,
size, reason -> Add line if needed -> Submit application.

ADMIN REVIEW:
Open the urgent review task or Material -> Uniform -> Applications.
Approve/reject EVERY line. Only those decisions can complete the review task.
Approval = Ready to collect. Rejection keeps the original record and status.
After collection: Ready to collect -> Mark issued -> confirm.

Specific / 专职 replaces the member field label Instrument.
The physical Instrument booking category remains unchanged.
Supplies / 补给 is present as an empty tab; no supplies workflow was specified.

Read UPDATE_FROM_v1.43.md for full instructions. Existing older update guides
refer to previous releases. Backend source/migrations record applied changes;
do not rerun migrations already present in the connected Supabase project.

Functional, permission and live transactional database tests passed. Test
fixtures were rolled back. Browser visual verification was unavailable.
