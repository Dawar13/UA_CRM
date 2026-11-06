# Phase 1: Core CRM, live for the team

Read `CLAUDE.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md` and the Phase 0 report before starting.

## Goal

Turn the Phase 0 skeleton into the CRM the founders use every day:
- real accounts and Google sign-in;
- data in Supabase, deployed on Vercel;
- full editing of rows, columns, sheets and stages;
- history, next actions, tags and links;
- quick-add with the duplicate check;
- search across everything and a Today view;
- import of the existing spreadsheet, export, nightly backups;
- **a strict ownership model: everyone can see everyone's sheets, and only the owner can change them.**

**Exit:** every member signs in, works only in their own tab, can view the others' tabs, and has used it daily for a week. The old spreadsheet is retired.

## Ground rules for this phase

1. **The current app is the design source of truth.** The founders reworked the design after Phase 0.
   - Build every new surface from the components and tokens that exist in `src/` and `/design` today.
   - If any document (including older parts of `CLAUDE.md`) describes visuals that differ from the code, the code wins, and you update the document.
   - This brief describes **behaviour only**. Where it mentions a UI element ("a menu", "a banner"), place it where the current design's patterns put such things.
   - New components go into `/design` with visual tests, like everything else.
2. **Permissions are part of every feature, not a separate feature.** Every write path ships with all three of these, or it is not done:
   - a UI permission check;
   - a database policy;
   - a test proving another member cannot do it.
3. **Behaviour that is the same in two places is written once,** in `domain/`. The Repository contract is tested against both the local and Supabase implementations.

## The ownership model

This is a new product rule. Add it to the product model in `CLAUDE.md` during M1.0.

**Principle:** a member's tab and everything in it (sheets, columns, stages, rows, history, files, trash) belongs to that member. Every other member can see it, but cannot change it.

| Action                                                                                | In your own tab                      | In another member's tab                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| View sheets, rows, history, links, files                                              | Yes                                  | Yes                                                        |
| Search, and jump to a row                                                             | Yes                                  | Yes                                                        |
| Call, WhatsApp or email a contact; open links; copy a cell                            | Yes                                  | Yes                                                        |
| Export a sheet                                                                        | Yes                                  | Yes (reading only; the founders can switch this off later) |
| Edit cells, warmth, stage, next action                                                | Yes                                  | No                                                         |
| Add, delete or paste rows; quick-add; import                                          | Yes                                  | No                                                         |
| Add history entries                                                                   | Yes                                  | No                                                         |
| Create, rename, reorder or delete sheets, columns or stages                           | Yes                                  | No                                                         |
| See and restore Trash                                                                 | Yes                                  | No (not visible at all)                                    |
| Link one of your rows to one of theirs (Introduced by, Connects to, Keep both linked) | Yes; the link is stored on your side | Their row shows the link, but nothing on their row changes |
| Copy a contact into your own sheet                                                    | Not applicable                       | Yes; creates a new row in your tab, linked to theirs       |
| Merge duplicates                                                                      | Only when both rows are yours        | No                                                         |

**Tags** are one shared vocabulary.
- Any member can create a tag and apply it to their own rows.
- Only the creator can rename, recolour or delete a tag, and only while no other member's rows use it. Otherwise the action is refused with a message naming whose rows use it.

**Members**
- A member is either an admin or a regular member. Both founders start as admins.
- Admins can add a member (name and Google email) and deactivate a member. Admins get no extra rights over anyone's data.
- A deactivated member cannot sign in. Their tab stays visible to everyone, marked inactive and view only.
- Transferring sheet ownership goes to `BACKLOG.md`.

**Calendar (affects Phase 2):** a calendar can only write history into its owner's rows. When an event matches a row in someone else's tab, it is shown as a read-only hint, and nothing is written.

### What view only looks like in behaviour

In another member's tab:
- **No editing controls exist.** That means no quick-add, no add row, no edit items in column or sheet menus, and no stage or warmth controls that respond.
- **The tab says it is view only, quietly and always,** and names the owner ("Dhruv's tab, view only").
- **Edit keystrokes do nothing.** This covers typing into a cell, Enter to edit, Delete, paste, `W`, `]` and `[`. The first attempt in a session shows one short toast ("Dhruv's sheets are view only"). Later attempts are silent.
- **Every reading action keeps working:** expand, search, copy, contact buttons, export, follow links.
- **"Copy to my sheet"** is available on any row. It asks which of your sheets to copy into, runs the duplicate check, and creates a linked row in your tab.
- **Other members' changes appear live** through Realtime, without moving your focus or scroll position.

---

## Founder setup (about 30 minutes, needed before M1.1 step 3)

When you reach M1.1 step 3, stop and ask the founders to do the following. Then collect the values from them into local `.env` files, Vercel and GitHub secrets. Never commit secrets and never paste them into docs.

1. **GitHub:** the `ua-crm` repository (private), plus a second private repository, `ua-crm-backups`.
2. **Supabase:**
   - Two free projects in the Mumbai region: `ua-crm-prod` and `ua-crm-staging`.
   - For each, note the project URL, the publishable (anon) key, the secret (service role) key and the database password.
3. **Google Cloud:**
   - A project named "UA Internal CRM".
   - The consent screen: External, with the publishing status set to In production.
   - An OAuth client of type Web application. Its authorised redirect URIs are each Supabase project's `https://<ref>.supabase.co/auth/v1/callback`.
   - Paste the client ID and secret into Supabase Auth, under Google provider, for both projects.
   - Sign-in uses only the basic scopes (openid, email, profile), so there is no unverified-app screen in Phase 1. The calendar scope is added in Phase 2.
4. **Vercel:**
   - Import the repository.
   - Set the Production environment variables from the prod project and the Preview variables from the staging project.
   - In each Supabase project's Auth URL settings, add the production URL, the Vercel preview URL pattern and `http://localhost:5173`.

---

## Milestones

Every milestone ends with: all tests green, light and dark screenshots of the new surfaces, an updated `PROGRESS.md` "try this" script, and a commit. Continue to the next milestone unless something needs a founder decision; in that case, ask and wait.

### M1.0 Reconcile (no feature code)

1. **Audit the app as it is now:**
   - read the code, run the app, open `/design`;
   - list the components, tokens and patterns available for the new surfaces;
   - list anything in `CLAUDE.md` that is stale against the code.
2. **Write `docs/phases/PHASE_1_PLAN.md`.** For each feature below, say:
   - where it will live in the current UI;
   - which existing components it uses;
   - which new components it needs;
   - which Repository methods it adds or changes.
3. **Update `CLAUDE.md`:**
   - fix the stale sections so the document matches the code;
   - add the ownership model above;
   - add the rule that the code is the design source of truth.
4. **If the plan raises a question only the founders can answer,** stop and ask. Otherwise continue.

### M1.1 Backend, sign-in and permissions in the database

1. **Local Supabase.** Set up the Supabase CLI with a local stack for development and tests. Email and password sign-in is enabled **only in the local config**, for test users; production allows Google only.
2. **Schema migrations** (`supabase/migrations/`) that mirror the existing domain types: members, sheets, columns, stages, rows, tags, row tags, history, row links, files, not-duplicate pairs.
   - **Ownership:** every owned table carries `owner_id` (denormalised from the sheet), so policies stay simple and fast.
   - **Last touch:** `rows.last_touch_at` is maintained by a trigger on history insert and delete. It is never written by the client.
   - **Identity keys** for the duplicate check are generated columns with indexes: E.164 phones, lowercased emails, the LinkedIn slug, and normalised name and company. Name and company also get `pg_trgm` indexes for similarity.
   - **Soft delete:** `deleted_at` on rows, columns and sheets.
   - **Audit:** `created_at`, `updated_at`, `created_by` and `updated_by` everywhere, with `updated_at` set by trigger.
3. **Stop for the founder setup above** if it is not done yet.
4. **Row-level security on every table,** using a `current_member()` helper that reads the signed-in user and their active membership.
   - **Select:** any active member can read every non-deleted record. Deleted records are readable only by their owner.
   - **Insert, update, delete:** only when `owner_id` is the current member.
   - **Tags:** a security-definer function enforces the rename, recolour and delete rule.
   - **Links:** the source row must be yours.
   - **Members:** only admins can insert members or change `active` and `is_admin`. Nobody can change their own `is_admin`.
   - A Google user who is not an active member can read nothing and write nothing.
5. **Sign-in:**
   - Google through Supabase Auth, with the redirect flow (not a popup).
   - A sign-in screen in the current design.
   - A non-member who signs in sees "This Google account isn't on the UA team list. Ask a founder to add you." and is signed out.
   - The session persists. Sign out sits in the account menu.
   - The signed-in member's tab is the default landing tab.
6. **`SupabaseRepository`** implements the full Repository interface. `LocalRepository` is brought up to the full interface too, and **enforces the same ownership rules in code**, so UI tests in local mode catch permission leaks.
   - Write one **contract test suite** and run it against both implementations: the same scenarios and the same expected results, including every permission refusal.
7. **Realtime:** subscribe to changes on sheets the user is viewing, and patch the TanStack Query cache. Policies apply to Realtime as well; test that a deleted row in someone else's Trash is not broadcast to others.
8. **Offline and errors:**
   - When the connection drops, show a quiet offline notice and block edits until it is back. Do not queue writes.
   - A failed write rolls back and says what happened in plain words.
9. **Deploy:**
   - Vercel builds previews against staging.
   - Production releases are manual: one GitHub workflow applies the migrations to prod, then triggers the production deploy.
   - Migrations must stay backward compatible for one release (expand first, contract later).
10. **CI:** add a `db` job that starts local Supabase and runs:
    - the database policy tests (`supabase test db`, pgTAP);
    - the contract tests against Supabase;
    - a small live end-to-end suite with two test users.

**Database policy tests must prove, for member A against member B's data:**
- A can read B's sheets, rows, history, links and files.
- A cannot insert, update or delete any of them, and cannot read B's Trash.
- A cannot rename a tag that B's rows use.
- A non-admin cannot add members.
- A deactivated member and a non-member can read nothing.
- Nobody can make themselves an admin.

### M1.2 View only, end to end

1. **Permission checks in the domain.** Add `can(member, action, target)` to `domain/` as the single source of truth for the UI, mirroring the matrix above. Add a `useCan` hook. Every editing control and every edit shortcut goes through it.
2. **Build the view-only behaviour** described in "What view only looks like in behaviour" above.
3. **Build "Copy to my sheet."**
4. **Tests:**
   - Unit tests for `can` over the whole matrix.
   - End-to-end tests in Dhruv's tab while signed in as Dawar:
     - there are no edit controls;
     - every edit keystroke does nothing;
     - the toast appears once per session;
     - expand, search, copy, export and contact buttons all work;
     - Copy to my sheet creates a linked row in Dawar's tab.
   - A live end-to-end test that a forced write through the API from the browser console is rejected by the database.

### M1.3 Editing the grid

All of this applies only in your own tab.

1. **Inline editing for every column type,** using the current design's editors:
   - Enter or typing starts an edit; Esc cancels; Enter or Tab commits.
   - Dropdown and multi-select use type-to-filter.
   - Dates accept natural language and fuzzy dates (chrono-node, IST, forward-dated).
   - Phone is normalised on commit.
   - Currency accepts "25L" and "1.2cr".
2. **Rows:**
   - `N` adds a row and focuses its Name cell.
   - Shift and Ctrl/Cmd select several rows.
   - Delete moves them to Trash, with Undo.
3. **Paste:**
   - A block copied from Excel or Google Sheets (tab-separated) fills cells from the active cell, adding rows as needed.
   - New rows from a paste go through the duplicate check (M1.6) as one batch review.
4. **Undo and redo** for the session (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z), covering every edit made in this milestone and later ones.
5. **Trash:**
   - Your deleted rows, columns and sheets, each with restore.
   - Items older than 30 days are purged, using `pg_cron` if available on the free plan, otherwise the nightly workflow. Log the choice.
6. **First release.** Deploy to production. Tell the founders they can start using it, and keep going. Their feedback goes into `BACKLOG.md`. If it changes something in progress, adjust the plan in `PHASE_1_PLAN.md`.

### M1.4 Sheets, columns, stages and members

1. **Sheets:**
   - Create from a template (the six in `CLAUDE.md`) or blank.
   - Rename, reorder by drag, and delete to Trash.
   - A new member's first sign-in offers "Start with the UA templates", which creates the five standard sheets.
2. **Columns:**
   - Add (name, type, options), rename, reorder by drag, resize, hide and show.
   - Change type with a preview of how existing values convert, listing values that won't convert.
   - Delete to Trash (restoring brings the data back).
   - System columns can be hidden but not deleted.
   - Width, order and visibility are saved per sheet.
3. **Stages:**
   - Add, rename, reorder and remove, and mark which stage is the win.
   - Removing a stage that rows sit at asks where those rows should go.
4. **Members (admins only):**
   - Add a member by name and Google email, deactivate, reactivate.
   - A new member's tab appears for everyone live.

### M1.5 Contact essentials

1. **History:**
   - The full timeline per row.
   - Add an entry (note, call, meeting, WhatsApp, email) with a date that defaults to today, and edit or delete your own entries.
   - Stage and warmth changes are logged automatically, as in Phase 0.
2. **Next action:** edit the text and the date (natural or fuzzy). Overdue and today states follow the current design.
3. **Tags:**
   - Create on the fly while tagging, with an auto colour.
   - Manage tags in one place: rename, recolour, delete, subject to the ownership rule.
   - Filter a sheet by tag.
4. **Links:**
   - Introduced by and Connects to editors with a person picker that searches every tab, plus free text for companies not in the CRM yet.
   - Links to other members' rows show the owner and sheet.
5. **Contact buttons:**
   - Call (`tel:`), WhatsApp (`https://wa.me/<digits>`) and email (`mailto:`) on rows that have the data.
   - Using one offers a one-click "log this" that adds a history entry.
6. **Files:**
   - Attach to a row through Supabase Storage, in a private bucket whose policies mirror the row ownership.
   - 10 MB per file; others can view and download.
   - Log the free-tier storage limit in `DECISIONS.md`.

### M1.6 Quick-add and the duplicate check

1. **Parser.** Implement the quick-add language from `CLAUDE.md` in `domain/quickadd/` as a pure function: text plus sheet schema plus existing rows in, parsed contacts with per-field confidence and warnings out.
   - Write a table of **at least 80 test cases**, including: every rule, mixed order, missing name, two contacts in one paste, unknown keys going to Notes, ambiguous keys, Indian phone formats, fuzzy and natural dates, `#warm` and `#waiting` and `#cold` versus ordinary tags, a `via:` match in another member's tab, and the `>` log-touch form.
2. **Quick-add surface,** placed as the current design dictates and present only in your own tab.
   - The preview shows each parsed field and flags anything uncertain.
   - Enter commits. Esc returns to editing.
   - Drafts survive a reload.
3. **Smart paste:** pasting an email signature or LinkedIn profile text runs the same parser.
4. **Duplicate check.** Implement the tiers from `CLAUDE.md` in `domain/dedupe/`, checking against all tabs (reading is allowed). Choices depend on ownership:
   - **Match in your tab:** Merge (fills empty fields; conflicts side by side), Keep both linked, Different person.
   - **Match in another member's tab:** Open their row, Keep both linked (your row is saved and linked), Different person. Merge is never offered.
   - "Different person" pairs are remembered and never flagged again.
   - The check runs for quick-add, manual new rows, pasted blocks, Copy to my sheet, and imports.
5. **Tests:**
   - Scorer unit tests: name variants with titles and spacing, the same first name at a different company (no alert), one common word (no alert).
   - End-to-end tests for each choice, in your own tab and across tabs.

### M1.7 Search and Today

1. **Search:**
   - A database function using `pg_trgm` similarity plus prefix matching across name, company, title, emails, phones, tags, notes and connects to. It returns rows from every tab, with the owner and sheet.
   - The command palette uses it. Results update as you type (debounced), and the top result appears within 300 ms on the prod dataset.
2. **Today tab** for the signed-in member only:
   - Overdue next actions.
   - Due today.
   - Added this week.
   - Each item opens its row in place.
   - Meetings and stale relationships arrive in Phase 2, so leave them out now (no empty placeholders).

### M1.8 Import, export, backup and launch

1. **Importer for the founders' existing spreadsheet.**
   - **Input:** the file's Dawar, Dhruv and Common blocks with the columns Name, Company, Type, Spl mentions, Date.
   - **Ownership:** each member imports only into their own tab. The importer shows that member's block plus the Common block; the member picks which Common rows to take, and rows another member already imported are marked.
   - **Mapping:**
     - Type: VC and Angel go to Investors; Advisor to Advisors; Friend to Connectors with Relationship set to Friend; Industry is chosen in the preview.
     - Spl mentions goes to Connects to (free text).
     - Date becomes an imported history entry, keeping fuzzy values such as "Mid oct".
   - Everything passes the duplicate check.
   - **Real files never enter the repository.** Tests use an invented fixture with the same structure.
2. **General import** of `.xlsx` and `.csv` into your own sheet: a column-mapping preview with remembered mappings, type conversion warnings, and the duplicate check.
3. **Export** (allowed on any visible sheet):
   - The current view (columns, filter, sort) to `.xlsx` with warmth and tag colours, and to PDF (A4 landscape).
   - "Export everything" produces one `.xlsx` with a tab per sheet, named "Member · Sheet".
   - **Tests** read the exported files back: ExcelJS for values and fills, pdfjs for text and page count.
4. **Nightly backup** (a GitHub Actions cron at 02:00 IST):
   - Dump the prod database with the Supabase CLI into `ua-crm-backups`, keeping the last 30 dumps.
   - Fail loudly through GitHub's failure notifications.
   - Write `docs/RUNBOOK.md`, explaining how to restore a dump into staging and then prod, and test the restore once on staging.
   - Record in `DECISIONS.md` how Storage files are backed up within free limits.
   - The daily job also keeps the free Supabase project from pausing.
5. **Launch checklist:**
   - Both founders sign in on prod.
   - Each imports their rows.
   - Each checks view only in the other's tab.
   - The backup has run once and the restore has been tested.
   - The founders confirm the old spreadsheet is retired.

---

## Tests added in this phase

The Phase 0 layers stay. Phase 1 adds:

| Layer                   | Command                 | Contents                                                                                                       |
| ----------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Database policies       | `supabase test db`      | pgTAP tests for every policy and trigger, including the cases in M1.1                                          |
| Contract                | `pnpm test:contract`    | One Repository suite run against LocalRepository and SupabaseRepository (local stack)                          |
| Integration             | `pnpm test:integration` | supabase-js as two signed-in test users: real reads, writes and refusals, plus Realtime delivery               |
| End to end (local mode) | `pnpm test:e2e`         | Fast, deterministic UI flows on LocalRepository, with a test hook to pick the signed-in member                 |
| End to end (live)       | `pnpm test:e2e:live`    | The main flows against local Supabase with two users, including view only and a rejected forced write          |
| Parser and dedupe       | part of `pnpm test`     | At least 80 quick-add cases and the scorer cases                                                               |
| Files                   | part of `pnpm test`     | Export read-back; import from fixtures                                                                         |
| Performance             | `pnpm test:perf`        | A 2,000-row sheet from local Supabase: first rows visible within 2 s; edits reflect within 100 ms (optimistic) |

`pnpm test:all` runs everything. CI runs everything on every push to `main` and on every pull request.

## Definition of Done additions for Phase 1

- Every write has a UI check through `can`, a database policy, and a test showing another member is refused.
- Every new surface is built from existing components, added to `/design`, and visually tested in light and dark.
- No secret appears in the repository, logs, screenshots or docs.

## Report at the end of Phase 1

Stop and reply with:
1. What was built, milestone by milestone.
2. The production URL, and the "try this" script for each founder.
3. Test counts per layer, coverage, and the CI link.
4. The permission matrix as implemented, and the test that proves each row of it.
5. Decisions taken, deviations from this brief, and free-tier usage (database size, storage, bandwidth) against their limits.
6. Founder feedback received during the phase and what was done with it.
7. Known issues, and suggestions for Phase 2.

Do not start Phase 2.
