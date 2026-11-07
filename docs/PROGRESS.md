# Progress

One entry per milestone: what was done, how to try it, known issues, and what comes next. Newest at the bottom.

---

## Phase 0 · M0.1 Repository, toolchain and dependencies

**Date:** 5 Nov 2026

### Done

- **Runtime:** Node 26.13.0 (LTS), pinned in `.nvmrc` and `engines` with `engineStrict`. pnpm 12.16.1 through corepack 0.36, pinned by `packageManager`.
- **Scaffold:** Vite 8, React 19.3 and TypeScript 7 (strict, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`), with the `@/` alias in both tsconfig and Vite.
- **Quality tools:** Biome 2.6 (recommended rules plus every a11y rule, `noExplicitAny` as an error), `.editorconfig`, and a lefthook pre-commit hook (Biome on staged files, then the typecheck).
- **Dependencies:** every library for Phases 0, 1 and 2 is installed and licence-checked (`docs/DECISIONS.md` D-015).
- **Dependency smoke tests:** `tests/unit/deps.smoke.test.ts`. Every library loads in Node and does one real thing, with no downloads.
- **Repo hygiene:** `.gitignore` (including `data/import/` and every `dist-*` build) and `.env.example` with commented Phase 1 and 2 placeholders.
- **CI:** `.github/workflows/ci.yml` (a `quality` job and a `browser` job in the Playwright container) and `.github/workflows/visual-baselines.yml` (manual; generates the Linux baselines and commits them).
- **Docs:** `README.md`, `docs/phases/PHASE_0.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md` and this file.

### Try this

```sh
npm install --global corepack@0.36.0   # once per machine: Node 26 no longer bundles corepack
corepack enable
pnpm install
pnpm dev        # open http://localhost:5173: the tab reads "UA · Internal CRM" with the UA favicon
pnpm test       # unit and component tests, including the dependency smoke tests
pnpm build      # typecheck, then production build into dist/
```

Screenshots: `docs/screenshots/m0.1-app-light.png`, `m0.1-app-dark.png`.

---

## Phase 0 · M0.2 Design system and the `/design` showcase

**Date:** 5 Nov 2026

### Done

- **Tokens:** `src/styles/tokens.ts` is the single source of truth; `pnpm tokens` generates `tokens.css` (light on `:root`, dark on `[data-theme="dark"]`, system through `prefers-color-scheme`). Tailwind 4's default palette is removed, so only tokens exist as utilities. Five CLAUDE.md hexes were adjusted to pass contrast (D-011).
- **Fonts:** Geist Variable and Geist Mono Variable, self-hosted through Fontsource. Base UI 14px, tabular figures for numbers.
- **Theme:** system, light and dark, stored under `ua-crm:theme`; an inline script in `index.html` sets `data-theme` before the first paint.
- **Primitives** (`src/components/ui/`): Button, IconButton, Input, Textarea, Kbd, Tabs, Menu, Popover, Tooltip, Dialog, Toast, Skeleton, Pill, Separator, EmptyState.
- **CRM components** (`src/components/crm/`): BrandLockup, WarmthChip, TagChip and TagList, StageDots, StageTracker, DateText, AvatarInitials, ThemeToggle, MemberTabs, SheetTabs. Tooltips and the warmth menu mount lazily so the grid stays fast (D-024).
- **`/design`:** every token, primitive and component in every state, light and dark (development and test builds only).
- **Tests:** component tests for every primitive and CRM component, and `tests/unit/tokens.contrast.test.ts` (both themes, every text and graphic pair, and `tokens.css` freshness).

### Try this

1. `pnpm dev`, then open http://localhost:5173/design.
2. Switch System, Light and Dark at the top. Every swatch shows its contrast ratio.
3. Hover a stage dot for its name and date; open the warmth menu and press 1, 2, 3 or 0.

Screenshots: `docs/screenshots/m0.2-design-light.png`, `m0.2-design-dark.png` (full page).

### Known issues

- axe reports one moderate "region" note on `/design`: portalled menus and tooltips sit outside landmarks. There are no serious or critical findings.

---

## Phase 0 · M0.3 Domain model and local data

**Date:** 5 Nov 2026

### Done

- **`src/domain/`** (pure TypeScript): Zod 4 schemas and inferred types, the six templates with the 15 archetypes, stages (move, skip, move back, lost, reopen, exact restore for undo), warmth, fuzzy dates in IST, identity normalisers (E.164 phones, emails, LinkedIn slugs, names with titles, company suffixes), en-IN money, calendar matching by email, tag colours, and field validation.
- **Repository:** `src/data/repository.ts` defines the full interface, including Phase 1 methods that throw `NotImplementedInPhase0`. `LocalRepository` (Dexie 4 on IndexedDB, versioned schema) implements Phase 0; every stage and warmth change writes the row and its history entry in one transaction.
- **Seed:** deterministic, invented data for Dawar and Dhruv (8 sheets, 45 rows, 8 tags, 16 calendar events), covering every warmth and stage, a won row, two lost rows, skipped stages, fuzzy dates, overdue and today next actions, cross-tab links, and the Arvind Menon pair for future duplicate tests.
- **Hooks:** TanStack Query hooks with optimistic updates, rollback on error, and an Undo toast that applies the inverse and records it in history.
- **Perf fixture:** a deterministic 2,000-row Customers sheet (`tests/fixtures/generateRows.ts`).

### Try this

1. `pnpm dev`, open http://localhost:5173 and switch to Dhruv → Investors. "Arvind Menon" is the investor twin of Dawar's connector "Cdr Arvind Menon".
2. In the browser's DevTools → Application → IndexedDB → `ua-crm`, browse the tables.
3. `pnpm test` runs 224 domain and data tests; `src/domain` is at 100% line coverage.

Screenshots: `docs/screenshots/m0.3-seed-dhruv-investors-light.png`, `-dark.png`.

---

## Phase 0 · M0.4 App shell and grid

**Date:** 5 Nov 2026

### Done

- **Routes:** `/` opens the last-used member and sheet; `/m/:member/:sheet?row=<id>` deep-links to an expanded row; `/design` is gated; anything else shows a friendly not-found page.
- **Layout:** the soft gradient strip, the 52px header (brand lockup, member tabs, search, theme toggle, overflow menu), the 40px sheet bar with row counts, the grid, and the 320px "This week" panel (Ctrl/Cmd+. toggles it and the choice is remembered).
- **Grid:** TanStack Table 9 and TanStack Virtual 3, rendered as DOM. Sticky header and Name column, 40px rows, every cell type, sorting remembered per sheet, a single tab stop with an `aria-activedescendant` active cell, and the full keyboard set (arrows, Home, End, Ctrl/Cmd+Home and End, PgUp, PgDn, Enter, Esc, W, `]`, `[`).
- **Expanded row:** the interactive stage tracker (move, move back, Mark lost, Reopen), warmth, next action, notes, the five latest history entries with "Show all", and Introduced by and Connects to chips that jump across member tabs.
- **Search:** Ctrl/Cmd+K opens a palette that searches every member and sheet with highlighting, grouped as "Member · Sheet", plus commands (switch member or sheet, theme, side panel, shortcuts).
- **Feedback:** skeletons while loading, Undo toasts, an error boundary, the `?` shortcut sheet, and a Developer menu in development builds (Reset sample data, Load 2,000-row sheet).

### Try this (the Phase 0 demo script)

1. `pnpm dev` and open http://localhost:5173. You land on **Dawar · Customers**.
2. Look across a row: warmth chip, stage dots (hover one for its date), tags, last touch and the next action. Meera Desai's "3 Nov" is overdue in red; Sunita Kulkarni's is "Today" in blue.
3. **Click Sunita Kulkarni's row.** It expands. In the stage tracker, click **Pilot scoped**: the dots move and today's date ("5 Nov") is stamped. Press **Undo** in the toast; it reverts, and both changes appear in History.
4. Click **Mark lost**: a red line reads "Lost after …". Click **Reopen**.
5. Change warmth from the chip in the expanded row.
6. **Keyboard only:** click the grid once, then use the arrows, **Enter** to expand, **W** to cycle warmth, **]** and **[** to move the stage, **Esc** to collapse.
7. Press **Ctrl+K** (⌘K on a Mac), type **menon** and see both Arvind Menon rows labelled "Dawar · Connectors" and "Dhruv · Investors". Press **Enter** to jump across tabs; the row opens and flashes.
8. In **Dhruv · Investors**, open Kiran Sethi and click the **Introduced by** chip: it jumps to Divya Kapoor in Dawar's Connectors.
9. In the **This week** panel, click the **Rohan Mehta** chip under "Call with Rohan Mehta" to jump to his row. Press **Ctrl+.** to hide and show the panel.
10. Press **?** for the shortcut sheet. Use the theme toggle (top right) to cycle System, Light and Dark.
11. Reload: the last sheet, theme, sort and every stage and warmth change are still there.
12. Overflow menu (…) → Developer → **Load 2,000-row sheet**, then scroll; **Reset sample data** restores the seed.

Screenshots: `docs/screenshots/m0.4-main-*.png`, `m0.4-expanded-*.png`, `m0.4-palette-*.png`, `m0.4-narrow-1024-*.png` (light and dark).

### Known issues

- Without a font preload, the very first uncached visit can show a brief font swap (D-012).
- Column order, widths and visibility are fixed defaults until the Phase 1 column manager (D-022).

---

## Phase 0 · M0.5 Quality gates and CI

**Date:** 5 Nov 2026

### Done

- **Playwright:** projects `desktop` (1440×900), `narrow` (1024×768) and `webkit-smoke` (`@smoke` tests). Every test freezes the clock at 5 Nov 2026 10:00 IST in Asia/Kolkata with en-IN, starts with an empty IndexedDB, and fails on any console error or warning.
- **End to end** (`tests/e2e/`): branding, navigation, stage, warmth, search, keyboard, theme (including no flash of the wrong theme), calendar panel, console, and an infrastructure smoke test.
- **Accessibility** (`tests/a11y/`): axe on the main screen (collapsed and expanded), the palette with results, and `/design`, in light and dark. Zero serious or critical violations.
- **Visual** (`tests/visual/`): the main screen, an expanded row, the palette, the 1024px layout and `/design` section by section, in light and dark. Baselines are Linux-only and come from CI (D-019).
- **Performance** (`tests/perf/`): the 2,000-row sheet shows its first rows within 1.5 s, reaches the last row with Ctrl/Cmd+End, and has no long task over 200 ms while scrolling.
- **CI:** `quality` (lint, typecheck, coverage thresholds, build) and `browser` (e2e, a11y, visual, perf) on every push and pull request to `main`, with reports and traces uploaded on failure.

### Results (local, Windows 11)

CI is green on `main` with the baselines: [run 42045378731](https://github.com/Dawar13/UA_CRM/actions/runs/42045378731). Lint, typecheck, unit and component tests with coverage, build, e2e, a11y, visual and perf all pass.

| Layer                       | Result                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Lint and typecheck          | Clean                                                                                            |
| Unit and component (Vitest) | 505 passed in 29 files                                                                           |
| Coverage                    | 91.3% lines overall (threshold 70%); 100% lines in `src/domain` (threshold 90%)                  |
| End to end                  | 104 passed (desktop, narrow and webkit-smoke)                                                    |
| Accessibility               | 8 passed, zero serious or critical                                                               |
| Performance                 | Passed, repeated 4 times                                                                         |
| Visual                      | Skipped on Windows by design; 38 Linux baselines (desktop and narrow, light and dark) pass in CI |

### Try this

```sh
pnpm test:coverage
pnpm exec playwright install --only-shell chromium && pnpm exec playwright install webkit
pnpm test:e2e
pnpm test:a11y
pnpm test:perf
pnpm test:all      # everything above, plus lint, typecheck and build
```

To create the visual baselines: push, then GitHub → Actions → **Visual baselines** → **Run workflow**. It commits the screenshots to the branch; pull afterwards.

Screenshots: `docs/screenshots/m0.5-perf-2000-light.png`, `-dark.png`.

### Known issues

- After an intentional visual change, run the Visual baselines workflow, then CI (Actions → CI → Run workflow), then pull.
- WebKit's IndexedDB is slow in its Windows build, so the `webkit-smoke` project runs with 2 workers and a 60 s timeout.

## Phase 0 · M0.6 The founders' redesign

**Date:** 6 Nov 2026

After reviewing Phase 0, the founders asked for a calmer, more art-like look and approved it over four prototype rounds (D-027). This milestone builds that design into the app.

### Done

- **Tokens:** paper white surfaces; the navy-to-white blue palette for folders, stages and the pipeline funnel; the earthy field palette (olive, ochre, brick, sand) for warmth and activity; squarer corners (4 / 6 / 8 / 10px); 56px header and 36px single-line, spreadsheet-style rows with visible gridlines (D-031). Every text pair is contrast-tested in both themes (D-028).
- **Sheets are folders:** blue gradient folder tabs (01 deepest to 05 lightest); the active tab joins a folder front that fades into the sheet. The front shows People, Open pipeline (or This week), Won (or Next actions) and Due, plus a frosted pipeline card: a horizontal funnel, from a full-height mouth to a rounded spout, whose thickness follows how many reached each stage, with the share that moved on, and warmth squares for who is there now, shaded by how recently they were touched. Clicking the active tab folds the front to one line; the choice is remembered, and short screens start folded.
- **Grid:** two-line name cells with grey gradient monograms (title and company as the second line, so those columns are hidden by default), soft warmth chips, a joined stage bar beside the stage name, legend-style tags, Geist Mono dates and a blue "Today" chip.
- **Expanded row:** joined stage blocks with names and dates, a warmth radio group, next action, notes, fields and a history with tinted icon tiles.
- **Side panel:** a 7-day strip and a 30-day dot field (touches held stack up in deepening greens, a blue dot when a stage moved, missed follow-ups hang below a sand line from ochre to brick), then agenda cards.
- **Header and primitives:** gradient brand mark and favicon, segmented member switch, soft search pill; the `/design` page documents the whole system.
- **Data:** `summariseSheet` and `activityByDay` in the domain; `listMemberRows` and `listMemberHistory` in the Repository (D-029). The seed version is 2, so open browsers reseed with the new column widths.

### Results (local, Windows 11)

CI is green on `main` with the redesign, the spreadsheet-style grid, the funnel and their Linux baselines: [run 42177911646](https://github.com/Dawar13/UA_CRM/actions/runs/42177911646). Lint, typecheck, unit and component tests with coverage, build, e2e, a11y, visual and perf all pass.

| Layer                       | Result                                                                            |
| --------------------------- | --------------------------------------------------------------------------------- |
| Lint and typecheck          | Clean                                                                             |
| Unit and component (Vitest) | 639 passed in 37 files                                                            |
| Coverage                    | 92.9% lines overall (threshold 70%); `src/domain` above its 90% threshold         |
| End to end                  | 106 passed (desktop, narrow and webkit-smoke)                                     |
| Accessibility               | 8 passed, zero serious or critical                                                |
| Performance                 | Passed (2,000 rows)                                                               |
| Visual                      | Skipped on Windows by design; the Linux baselines were regenerated and pass in CI |

### Try this

1. Open `/m/dawar/customers`. The Customers folder is the deepest blue; its front shows 12 people, ₹2.2 Cr open pipeline, ₹30 L won and 2 due. The funnel narrows from 12 identified to 1 paid, with 83%, 80%… between stages.
2. Click the open **Customers** tab: the front folds to one line. Reload: it stays folded. Press Enter on the tab to unfold it.
3. Switch to **Investors** and **Connectors**: each folder is a lighter blue; Connectors (no stages) groups people by relationship.
4. Open Sunita Kulkarni's row: click **Pilot scoped**, see the block take the ramp colour, "5 Nov" stamped and a new history line; Undo restores it. Choose **Cold** in the warmth group; the chip in the row and the square in the pipeline card change.
5. In the side panel, hover the 30-day dots: each column says what was held, moved and missed that day.
6. Toggle dark mode from the header: folders run from #0078B7 down to navy, and the field shades run dim to bright.
7. Visit `/design` for the full system.

Screenshots: `docs/screenshots/m0.6-*-light.png` and `-dark.png` (main, expanded, investors, connectors folded, palette, 1024px, design, 2,000 rows).

### Known issues

- Visual baselines: after pushing, run GitHub → Actions → **Visual baselines** → **Run workflow**, then **CI** → **Run workflow**, then pull.
- Until the calendar is connected (Phase 2), "missed" in the dot field means an exact-dated next action that passed with no touch since; the seed has one.
- Locally, running every Playwright project with the default worker count can overload a busy machine and time out; CI uses 2 workers. Use `--workers=3` locally if that happens.

### Next

Phase 0, including the redesign, is complete pending the founders' review. Phase 1 starts after the review, with its own brief.

## Phase 1 · M1.0 Reconcile

**Date:** 6 Nov 2026

### Done

- Saved the brief as `docs/phases/PHASE_1.md`.
- Audited the app as built after M0.6 and wrote `docs/phases/PHASE_1_PLAN.md`: the layout, every component, token and pattern available, and for each Phase 1 feature where it lives, which existing components it uses, which new components it needs and which Repository methods it adds or changes.
- Updated `CLAUDE.md`: the ownership model (§2.14), the rule that the code is the design source of truth (§3.2, §7), the Today item and view-only note in the layout (§2.1), members as admins or regular and active or deactivated (§2.2), owner-only Trash (§2.13), in-house tooltips and the hosting choice (§4), the architecture tree as built plus the Phase 1 folders (§5), the Phase 1 test layers and Definition of Done (§6), and Phase 1's summary and exit (§8).

### Next

Four questions for the founders (plan §5): hosting provider, the private repository, Docker for the local Supabase stack, and two Phase 0 leftovers. Then M1.1.

### Founder feedback, 6 Nov 2026

- **Names without initials** (D-034): the initials tile beside every name is gone. Names stand alone in the grid, search, link chips, calendar chips and the member switch. Try it: open the app in light and dark; each row starts with the name.
- **Turnover bands** (D-035): Customers now offer Micro < ₹10 Cr, Small ₹10–100 Cr, Medium ₹100–500 Cr and Large > ₹500 Cr, after India's MSME limits. Try it: scroll the Customers grid right to the Turnover band column; the sample data reseeds on the next load.
- **Light sign-in** (D-035): email and password, logins created in the Supabase dashboard, one Supabase project and no staging. The founder setup in `docs/phases/PHASE_1.md` is now about 10 minutes and needs no Google Cloud project.

## Phase 1 · M1.1 Backend, sign-in and permissions in the database

**Date:** 6 Nov 2026

### Done

- **Supabase schema** in `supabase/migrations/`: members, sheets, columns, stages, rows, tags, history, links, files and not-duplicate pairs, with owners set by triggers, audit columns, generated identity keys for the duplicate check, and `pg_trgm` for fuzzy names.
- **Row-level security** on every table: everyone on the team reads everything; only the owner writes. Guard triggers protect member rights and tags in use. A login without an active membership reads and writes nothing.
- **Domain-shaped SQL functions** (`api_*`, D-036) for every read and write the Repository needs, and `SupabaseRepository` built on them with the same domain functions and `can()` checks as `LocalRepository`.
- **Email and password sign-in** (D-035): the sign-in screen, "not on the team" and "deactivated" refusals, change password, sign out, and a quiet offline notice.
- **Realtime:** other members' changes refresh open screens in one batch (D-037).
- **Tests:** 59 pgTAP ownership checks and 37 API checks; the Repository contract runs against both repositories.

### Try this

1. `pnpm dev`, then open `http://localhost:5173`. Without `VITE_DATA=supabase` the app runs on sample data as Dawar.
2. To try the real database: add `VITE_DATA=supabase` to `.env` and restart. The sign-in screen appears; sign in with a login from the Supabase dashboard whose email is on the team list (`docs/RUNBOOK.md` §2.1).

## Phase 1 · M1.2 View only, end to end

### Done

- `useEditGate` and `can()` decide every control. In another member's tab there is no quick-add, no add line, no edit items in menus and no responsive stage or warmth controls; the folder front says "Dhruv's tab, view only".
- Edit keys do nothing there; the first try in a session shows one toast ("Dhruv's sheets are view only").
- Reading actions all work: expand, search, copy, contact buttons, export, links. "Copy to my sheet" asks which of your sheets, runs the duplicate check and links the two rows.

### Try this

1. Open Dhruv's tab from the member switch. Type a letter in the grid: one toast, nothing changes.
2. Expand a row and choose **Copy to my sheet**: the copy lands in your tab, and both rows show a **Same person** chip that jumps to the other.

## Phase 1 · M1.3 Editing the grid

### Done

- Every column type edits in place: text, long text, number, currency, fuzzy dates, dropdowns and multi-selects with type-ahead, tags (pick or create), person links, checkboxes. Typing replaces a cell; Enter or F2 edits it; Tab saves and moves right; Esc cancels.
- **N** or the add line adds a contact with its name typed straight in. Shift+arrows or Ctrl+click select rows; Delete clears a cell or trashes the selection; Ctrl+Delete trashes the row.
- Copy and paste as tab-separated text, to and from Excel or Google Sheets; pasting several lines of plain text goes to quick add instead.
- Columns resize and drag to reorder; clicking a header sorts, and its menu hides the column or opens the column manager.
- **Trash** (More → Trash) lists your deleted rows, columns and sheets for 30 days, with Restore. Every change has Undo and Redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, D-038).

### Try this

1. In your Customers, click a Company cell and type a new name, then Enter. Ctrl+Z puts it back.
2. Press **N**, type "Asha Rao", Enter. Then Ctrl+Delete on her row, and restore her from More → Trash.
3. Copy two rows from a spreadsheet and paste them into the grid.

## Phase 1 · M1.4 Sheets, columns, stages and members

### Done

- **New sheet** from a template (Customers, Investors, Advisors and experts, Connectors, Service providers) or blank; an empty tab offers "Start with the UA templates". Rename, reorder by dragging the folder tabs, delete to Trash.
- **Columns** (sheet menu → Columns): add, rename, hide, reorder and delete custom columns; change a column's type with a preview of what converts and what does not.
- **Stage editor** (click the stage count on the folder front): add, rename, reorder and remove stages; rows at a removed stage move with a preview.
- **Team** (More → Team, admins only): add a member, deactivate and reactivate. Admins get no extra rights over anyone's data.

### Try this

1. Choose **New sheet** → Blank, name it "Events". Add a column "City" (text), then change its type to dropdown.
2. In Customers, open the stage editor from the folder front and rename "Plant visit" to "Site visit".

## Phase 1 · M1.5 Contact essentials

### Done

- **History** in the expanded row: log a call, meeting, WhatsApp, email or note with a date; edit or delete your own logged touches. Stage and warmth changes are recorded automatically.
- **Next action** with fuzzy dates ("mid Nov", "fri 4pm").
- **Contact buttons:** call, WhatsApp and email, each offering to log the touch.
- **Files:** attach up to 10 MB per file, open and remove (D-040).
- **Tags library** (More → Tags): rename, recolour and delete, only by the tag's creator and only while no other member's rows use it. A tag filter on the sheet bar.
- **Same person** links between rows, shown as chips that jump to the other row.

### Try this

1. Expand Sunita Kulkarni. In History, choose Call, write "asked for the quote" and press **Log**. Set the next action to "mid Nov send quote".
2. More → Tags: recolour "foundry". Filter the sheet by it from the tag chip on the sheet bar.

## Phase 1 · M1.6 Quick-add and the duplicate check

### Done

- The quick-add language of CLAUDE.md §2.6 (`/` or the quick-add line): names, titles, companies, locations, phones, emails, LinkedIn, keys, fuzzy-matched stages and dropdowns, `#tags`, warmth, next actions, several contacts separated by blank lines, and `>` to log a touch on the selected row. Nothing is dropped; leftovers go to Notes. Drafts survive a reload.
- Enter shows a preview card with each field coloured by confidence; Enter again saves.
- **Smart paste:** an email signature or LinkedIn text pasted into the grid goes through the same parser; a block or a single column copied from a spreadsheet fills cells (D-045).
- **The duplicate check** (D-039) on every new row, paste and import, across every member: hard matches block saving until you choose Merge, Keep both, linked or Different person; soft matches show a note.

### Try this

1. Press `/` and paste the example from CLAUDE.md §2.6. Enter shows the preview; Rohan Mehta is flagged as a hard duplicate (same phone). Choose **Keep both, linked**, then Enter.
2. Select a row, press `/`, type `> called, wants pilot on line 3, quote by 15 nov`, Enter: a dated history line and a new next action.

## Phase 1 · M1.7 Search and Today

### Done

- **Search** (Ctrl/Cmd+K) across every member and sheet: names, companies, titles, emails, phones, tags, notes and connects-to, ranked, with fuzzy names on Supabase. Enter jumps to the row and opens it.
- **Today** (first in the member switch): overdue next actions, due today and added this week for the signed-in member, each section collapsible, each item one click from its row.

### Try this

1. Ctrl+K, type "menon": results from both members, each with "Member · Sheet".
2. Choose **Today** in the member switch: Meera Desai is overdue, Sunita Kulkarni is due today.

## Phase 1 · M1.8 Import, export, backup and launch

### Done

- **The founders' spreadsheet importer** (More → Import the old spreadsheet): reads the Dawar, Dhruv and Common blocks, maps Type to sheets, Spl mentions to Connects to and Date to an imported history entry (fuzzy dates kept), lets you pick Common rows, marks rows the other founder already imported, and runs the duplicate check.
- **General import** of .xlsx and .csv into your own sheet (sheet menu → Import from a file), with a mapping preview remembered per sheet and conversion warnings.
- **Export** of the current view to Excel (warmth and tag colours) and PDF (A4 landscape), from any sheet including other members'; **Export everything** to one workbook with a tab per sheet.
- **Nightly backup** (D-042): the database dump and the files into the private `ua-crm-backups` repository at 02:00 IST, keeping 30, with a restore check every night. `docs/RUNBOOK.md` covers setup, releases and restoring.
- **Releases** (D-046): Vercel builds from the repository on every push to `main` (`vercel.json`); production uses Supabase, previews run on sample data. A first version built releases in GitHub Actions (D-041); the founders asked for less setup, so it was removed.
- **Live browser tests** (D-043) against Supabase: sign-in, view only, a forced write refused by the database, and Realtime. Running them against the hosted project found that a quick reload could drop a new row's save; adding a row is now faster and the browser asks before leaving mid-save (D-037).
- **The founders' logo** is the brand mark and favicon (D-044).

### Try this

1. Open Customers → **Export** → Excel: the file opens with warmth and tag colours. Try PDF too.
2. Sheet menu → **Import from a file**, pick any small .csv: map the columns and import.

## Phase 1 · Results and launch

**Results (local, Windows 11, 6 Nov 2026)**

| Layer                                 | Result                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lint and typecheck                    | Clean                                                                                                                                                                                                        |
| Unit, contract and component (Vitest) | 960 passed in 54 files (the Supabase contract file is skipped locally; it runs in CI)                                                                                                                        |
| Coverage                              | 72.75% lines overall (threshold 70%); `src/domain` above its 90% threshold                                                                                                                                   |
| End to end and accessibility          | 213 passed, 1 flaky (passed on retry) on desktop, narrow (1024px) and WebKit, with CI's 2 workers and 1 retry                                                                                                |
| Accessibility                         | 16 passed, zero serious or critical, light and dark, including Today, view only, quick add and Trash                                                                                                         |
| Performance                           | Not passing on this machine while a stray process held two cores: first rows 1.6 to 1.8 s (limit 1.5 s; 1.0 to 1.2 s measured in isolation), one scroll task 208 ms (limit 200). CI is the reference (D-045) |
| Visual                                | Skipped on Windows by design; new and changed baselines need the Visual baselines workflow (Known issues)                                                                                                    |
| Against the hosted project            | 59 pgTAP ownership and 37 API checks, the Repository contract (40), the live browser suite (5), the Storage backup round trip: all passed, all test data removed                                             |

Screenshots: `docs/screenshots/m1-*-light.png` and `-dark.png` (main, view only, editing, quick add, expanded, Today, Trash, export, sign-in, the Phase 1 sections of `/design`).

### Launch checklist (founders; steps in `docs/RUNBOOK.md`)

1. Create Dhruv's login and add both founders to the team list (§2.1).
2. Push, then run **Visual baselines** and **CI** from the Actions tab.
3. Import the repository in Vercel with three variables (§2.2); set the Site URL in Supabase.
4. Create `ua-crm-backups`, its token and four secrets, then run **Nightly backup** once (§2.3).
5. Each founder signs in on production, imports their rows from the old spreadsheet, and checks view only in the other's tab.
6. Use it daily for a week, then retire the old spreadsheet (the Phase 1 exit).

### Known issues

- **Visual baselines:** the new screens (Today, view only, three `/design` sections) and the changed ones (names without initials, the logo) need Linux baselines. After pushing: Actions → **Visual baselines** → Run workflow, then **CI** → Run workflow, then pull.
- **The backup workflow** has not run yet: it needs the settings above, and its dump and restore steps need Docker, which GitHub's runners have and this machine does not. Its scripts were checked locally where possible (the Storage mirror and restore against the real bucket, the row counter on a sample dump).
- **Region:** the Supabase project is in Tokyo, not Mumbai. Each round trip from India takes about 150 to 250 ms; edits are optimistic, so typing feels instant, but first loads are slower. Moving is a new Mumbai project plus the restore in `docs/RUNBOOK.md` §5, best done before real data goes in.
- The build warns that the main chunk is over 1.5 MB (the import and export libraries among it); splitting it is in the backlog.
- Locally, running every Playwright project with many workers can overload the machine; CI uses 2 workers and 1 retry. The warmth test that reloads right after W was flaky under that load and passes on retry.
- The performance smoke is close to its limits on this machine (D-045). If CI fails it too, lighter grid rows are the next step (`docs/BACKLOG.md`).

### Next

Phase 1 is built. It ends when both founders have used it for a week and retired the old spreadsheet; then their feedback goes into `docs/BACKLOG.md` and the Phase 2 brief is written.

### Founder feedback, 7 Nov 2026 (first use)

- **Defaults:** the app opens in light, with the side panel closed; both choices are remembered once changed. Try it: open the app in a fresh browser.
- **Menus:** icons and labels sit on one line in the ⋯ menu, the sheet menu, the column header menu and the export menu. The column header menu also sorts, and shows every hidden column again in one click ("Show 7 hidden columns"); the export menu says it exports this view.
- **Empty-state heatmap:** every empty state (no sheets, no rows, no search results, a clear week) shows the same small heatmap: quiet grey cells, the first column in stage blues with one deep-blue cell, popping in with a short ripple. In the side panel its rows are the hours of today (9, 12, 3, 6) and the deep-blue cell is now. Try it: `/design#empty`.
- **Sign-in fixes:** a malformed email in the team list no longer blanks the app; the runbook's snippet warns to replace its placeholders.
- **Stage tracker:** in an expanded row, stages passed are pencil hatching in their own blue (lightest first, deepening along the bar), the current stage is solid with its ring, and skipped stages are faint grey hatching. Try it: open Karthik Subramanian's row.
- **Cell formatting:** right-click a cell for a fill colour (eight light hues, or No fill; several selected rows at once), wrap a column's text from its menu (rows grow to fit), and drag a row's bottom edge to make it taller (double-click to reset). Try it: right-click Rohan Mehta's Company cell.

## Phase 2 · Part 1 · Google Calendar

**Done** (D-050 to D-052)

- **The server** (`api/`): connect, the OAuth callback, sync, disconnect, next-action events, Google's push webhook and a daily job, as Vercel functions. Refresh tokens are sealed with AES-256-GCM and never reach the browser; logs carry ids, counts and codes only.
- **The database** (`20261108090000_calendar.sql`): connections, sealed tokens, one-time OAuth states, synced events and suggestion answers, each readable by its own member only (tokens and states by nobody); calendar history only through owner-checked functions.
- **Sync:** from 5 Nov 2026, 60 days ahead, on open, every 15 minutes, on Sync now, live through Google's push, and daily. Ended meetings with your contacts log themselves in their history, once, in your own rows only.
- **On screen:** the side panel's states (connect, synced, a failed sync, access ended, another member's calendar is private); the Calendar page (`/calendar`), a week like Google Calendar's with contacts on events, from the Calendar item after Today, the panel's expand button or the ⋯ menu; Today's meetings on Today; a meeting mark beside a contact's name in the grid and Next meeting in the expanded row; "Rohan Mehta?" suggestions with yes and no.
- **Next actions in the calendar:** Add to calendar (exact day, all day or a time, the contact invited only when asked); CRM edits move or remove the event, with Undo; moves in Google come back with a note; a deletion in Google offers Add again.
- **Sample mode** behaves the same without Google, so previews and the browser tests cover every flow.

**Try this (sample data: `pnpm dev`, or a preview)**

1. Open the side panel (Ctrl+.): this week's sample meetings, "Synced …" and Sync now. Choose the expand button: the week page. Press → and ← to move a week.
2. Open Rohan Mehta's row: Next meeting shows today's call. Under Next action choose **Add to calendar**, untick All day, set 4:00 pm, Add. The panel shows "Send ROI note · Rohan Mehta" tomorrow. Change the next action to "mon Send ROI note": the event moves to Monday. **Remove**, then Undo.
3. Switch to Dhruv's tab: "Dhruv's calendar is private". ⋯ → Act as Dhruv: now his week shows.
4. ⋯ → Disconnect calendar → Disconnect: the panel offers Connect Google Calendar. Connect: in sample mode it comes straight back.
5. Today: Today's meetings sit above the next actions.

**On production** the founders follow `docs/RUNBOOK.md` §7: the Google Cloud project, eight Vercel variables, the migrations, then the first connection and its checks (invitations, live updates, meetings logging, next actions).

**Results (local, Windows 11, 7 Nov 2026)**

| Layer                                         | Result                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint and typecheck                            | Clean                                                                                                                                       |
| Unit, contract, component and server (Vitest) | 1,092 passed in 63 files; 2 skipped locally (the Supabase repository contract and the Supabase calendar store, which run in CI)             |
| Server (part of the above)                    | 46: OAuth, PKCE, scope and refresh-token checks, windowed sync, backoff, locks, meetings, next actions, push, the daily job, logs, refusals |
| Coverage                                      | 71% of lines overall (threshold 70%); `src/domain` above 90%; the server library 87 to 100%, except the Supabase store (CI only)            |
| Database policies                             | 30 calendar checks on PGlite (policies, functions, refusals); the full pgTAP run is in CI                                                   |
| End to end and accessibility                  | 240 on desktop, narrow and WebKit: 233 passed in the full run; the 7 that timed out under this machine's load passed when rerun             |
| Visual and performance                        | Visual skipped on Windows by design (new baselines needed); performance left to CI (D-045)                                                  |

Screenshots: `docs/screenshots/p2-*-light.png` and `-dark.png` (the week page, the panel, Add to calendar, another member's calendar, the menu, Today).

**Known issues**

- **Not yet run against Google or Vercel.** No Google Cloud project exists yet, so the OAuth flow, push and the functions' deployment are checked with a fake Google and an in-memory store, and the Supabase store runs against the local stack in CI only. The founders' first connection (RUNBOOK §7.4) is the real test; the first thing to confirm is that the deployment built the functions (`/api/calendar/sync` answers 401 when called without signing in, not 404).
- **Two questions for that first connection:** whether `calendar.events.owned` returns invitations from others, and whether Google accepts the production address for push without verifying the domain. Both have a fallback (a scope setting; polling every 15 minutes).
- **Visual baselines:** the header's new Calendar item, the panel's sync line and the `/design` Calendar section need new Linux baselines (Actions → Visual baselines, then CI).
- The hosted database needs `20261107150000_cell_format.sql` and `20261108090000_calendar.sql` (RUNBOOK §7.3) before this code is pushed. If the code arrives first, the calendar simply reads as not connected, and connecting fails until the migration and the variables are in place.
- Coverage is 71% of lines overall (threshold 70%): the Supabase store and the functions' wiring are covered only by the CI run against local Supabase, which coverage does not count.

**Next**

Part 1 ends with the founders' first connections and a week of use. Part 2 (PDF and photo import) is not started.
