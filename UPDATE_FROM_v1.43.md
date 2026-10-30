# COPKU v1.44 — Material and uniform system

This cumulative update-only ZIP supports a complete v1.40, v1.41, v1.42 or v1.43
orchestra website. Merge its files into that complete folder, replace matching
files, then deploy the complete merged folder to Netlify. Do not deploy the patch
alone. Hard-refresh afterward with Ctrl+Shift+R or Command+Shift+R.

## Setup already completed

The connected orchestra Supabase database and the `portal-material` Edge
Function have been installed and verified. No manual Supabase SQL, bucket or
function configuration is needed. Existing private resource-image storage is
reused. The SQL and backend files included in the patch record the installed
changes; do not rerun already-applied migrations. The separate email website is
unchanged.

The eight starting classifications are present: Service uniform, Service
trousers, Service shirt, Service shoes, Coat, Socks, Belt and Service cap. No real
uniform types, sizes, photographs or member issue records have been invented.
The private demo contains clearly separate browser-local sample records.

## First configuration as administrator

1. Open **Material → Uniform → Uniform data**.
2. Under a classification, click **Add type**. Enter its name, such as Type-1.
   Optionally upload one PNG/JPG/WebP/GIF preview image, up to 10 MB. You can
   remove a selected or existing image before saving.
3. Add measurement names, including their units, such as **Chest (cm)** and
   **Waist (cm)**. Add size rows such as S, M, L and XL. Every defined measurement
   must be filled for every size. Accessories can have sizes without measurement
   columns. Click **Save uniform type**.
4. Repeat for the required classifications and types. **Add classification**,
   **Rename**, **Edit** and **Delete** are available in Uniform data. Deleting an
   entry removes it from new selection while retaining issued records and
   application history.
5. Return to **My uniforms → Group templates → Add template**. Give the template
   a name and choose its member groups. Check only the uniform types that group
   is allowed to request, then click **Save template**.

For example, set Department to **Orchestra**, choose Service uniform Type-1 and
Service trousers Type-2, and save. For a Windband woodwind template, set
Department to **Windband** and Occupation to **windband-woodwind**, then choose
the appropriate uniform and trousers types. Other filters can be left empty.

Templates support Department, Occupation, Specific, personnel Classification,
Rank and Status. Values within one filter are alternatives; different filters
must all match. Empty filters allow everyone. If templates overlap, higher
priority wins **per uniform classification**. At the same priority, more
specific groups win; equally specific templates combine their permitted types.
No matching template means no selectable type for that classification.

## Member application

Each member opens **Material → Uniform** to see their personnel details and a
compact Classification / Type / Size / Status table. Clicking an assigned or
applied type opens its uniform data and size chart.

Below the table, select a classification, **Newly apply** or **Exchange**, an
allowed type, a listed size and a reason. **Add line** adds another classification;
**Remove** removes a line. Submit all lines together. New applications require no
existing record; exchanges require an issued uniform. A ready-to-collect item
must be collected before an exchange. Only one pending application is allowed
for a member and classification at a time.

The table shows the applied size and **Pending** while a decision is outstanding.
For exchanges it also shows the original type and size. Group eligibility and
size choices are checked on the server, not just in the dropdown.

## Administrator review and collection

Submission creates one urgent mandatory review task for all current
administrators. Open **Review uniform application** from the task, or use
**Material → Uniform → Applications**. Click an application to see its lines,
reasons and previous records. Approve or reject each line; notes are optional.
The task cannot be completed, declined or withdrawn using ordinary task actions.
It finishes only when every line has an approval or rejection.

- **Approve** changes that classification's member record to **Ready to collect**.
- **Reject** keeps the original uniform record and status, including the old size.
- After collection, open **Ready to collect**, select **Mark issued**, and confirm
  collection. The member's status then becomes **Issued**.

Application and issue records are retained. Repeating a successful submission or
approval does not duplicate applications or revert a collected uniform.
Refresh the page or use **Refresh** to see newly saved decisions or issue status.

## Specific and Supplies

The member field previously labelled Instrument is now **Specific / 专职** in
personnel tables, filters, account forms, task recipient lists, personal pages
and uniform group templates. Existing values are preserved. Instrument booking
resources still use the name Instrument.

The sidebar now places **Material / 物资** immediately below Booking, with
**Uniform / 制服** and **Supplies / 补给** tabs. Supplies currently has an empty
list; no supplies inventory or request workflow was specified for this update.

## Verification

Connected-database transactional tests passed for size validation, group
restriction and specificity, multi-line applications, pending uniqueness,
idempotency, decision-only tasks, partial/final decisions, approval, rejection,
collection, exchange restoration, catalogue archiving and access restrictions.
All test fixtures were rolled back. Only the eight initial classifications
remain, awaiting the real catalogue.

Controller/backend tests passed for the measurement/image editor, group
selection, multi-line forms, pending/ready/issued states, collection, translations,
Specific labels and navigation. Existing booking, member, discussion and chat
regressions passed. The security advisory set is unchanged.

The managed local preview service was unavailable. Visual browser verification
was not completed; functional tests and native deployment verification were used.
The private Sites review copy and the official Netlify website are separate.
