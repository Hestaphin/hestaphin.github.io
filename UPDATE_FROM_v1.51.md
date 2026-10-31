# COPKU v1.52 — reply attachments and separate uniform types

This update-only package is for a complete v1.51 orchestra website. The separate email website, shop prices and score player are unchanged.

## Installation order

1. The connected orchestra Supabase project must first have the `reply_attachments_and_uniform_items_v152` migration and the updated `portal-material` function installed. Codex can install these through the connected Supabase tools after their required confirmation is approved. **Do not deploy the website files before Codex confirms that backend installation succeeded.**
2. Keep a backup of your complete v1.51 website folder.
3. Copy the contents of the ZIP's inner folder into that complete folder, replacing matching files and keeping everything else.
4. Deploy the entire merged website folder to Netlify. This update ZIP cannot be deployed by itself.
5. Hard-refresh with Ctrl+Shift+R (Windows) or Command+Shift+R (Mac).

The SQL and function files are included for review and installation records. Do not run them manually while an automatic installation is pending, or apply them again after Codex confirms installation. No new email, Stripe, bucket or secret settings are required.

## Notification replies

- Replies accept up to eight attachments, each up to 10 MB. Selected files have a Remove control before sending. A reply may contain text, attachments, or both.
- Reply files use the existing private discussion bucket. Members who can read the discussion can open its attachments; unlinked uploads remain private to their owner. The database validates ownership, file size and the actual stored upload.
- Images have lazy previews. Other files have download links. MSCZ attachments retain the existing score Preview button.
- Reply-to-reply targets and reply notices remain in place. A rapid second click cannot submit the reply twice. Failed sends attempt to remove only that attempt's unreferenced uploads; published attachments are protected from that cleanup.
- File links for the displayed reply page are signed in batches, rather than making one signing request for every file in the discussion.

## Uniform applications

The restriction now applies to the individual catalogue item/type, rather than the whole classification. If the group template permits both types, a member can hold **Service uniform / Type-1** and **Service uniform / Type-2** together. They cannot newly apply for another Type-1 while they already hold that same item.

Each type has its own size and Pending / Ready to collect / Issued status. Different types in the same classification can appear as separate application lines and have separate pending applications. A pending or ready-to-collect record blocks only the same item, so another eligible type remains available.

Exchange applies to an issued record of the selected type and replaces that type's size/status after approval. It does not alter the member's other types. Rejection preserves the current record. Existing history and holdings are retained. A historical cross-type exchange, if one was already pending, retains its original previous-record meaning during review.

Administrators collect/issue the specific row they clicked. The review task still requires a decision on every line; it cannot be completed as a shortcut. Group-template eligibility remains enforced.

## Verification

Isolated PostgreSQL tests passed for per-item uniqueness, two types in the same classification, pending/new/exchange cases, independent collection, review-task completion, reply attachment limits, ownership and member/nonmember storage access. Existing optional uniform reasons and retry behaviour also passed. These tests used synthetic local profiles and rolled back their fixtures; live member records were not used for those tests.

UI and handler checks passed for removable reply files, attachment-only replies, duplicate-submit prevention, reply notices, MSCZ preview links, per-type uniform rows, new Type-2 alongside a Type-1 exchange, decision handling and item-specific collection RPC arguments. The complete migration also passed an earlier rollback-only DDL check on the live project's schema.

Supabase's live-data test and installation confirmations expired during preparation. Backend installation status must be checked before deployment. Managed browser visual QA was unavailable in this environment.
