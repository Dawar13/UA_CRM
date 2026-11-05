# Phase 0: Foundation and walking skeleton

Read `CLAUDE.md` first. This brief assumes everything in it.

## Goal

Lay the foundation that everything else stands on, and prove the look and feel early. At the end of Phase 0, the founders open the app locally and click through the real UA Internal CRM on sample data:
- branding at the top;
- member tabs and sheet tabs;
- a beautiful grid with warmth chips, stage dots and tags;
- rows that expand into a stage tracker they can move;
- search across everything;
- a calendar panel with sample events;
- light and dark mode.

Behind it, every dependency for all three phases is installed and smoke-tested, and every test layer runs green in CI.

No accounts are needed. There is no Supabase, no Vercel and no Google in this phase. Data lives in IndexedDB through the Repository interface, so Phase 1 swaps in Supabase without touching the UI.

## Out of scope

All of the following comes in Phase 1 or 2, and none of it should appear on screen (no dead buttons):
- sign-in;
- editing arbitrary cells;
- adding or deleting rows, columns, sheets or members;
- quick-add;
- the duplicate check UI;
- the Today view;
- import and export;
- the real calendar connection;
- PDF and OCR import.

## Milestones

Work through the milestones in order. Each one ends with: all tests green, light and dark screenshots saved in `docs/screenshots/m0.x-*.png`, `docs/PROGRESS.md` updated with a short "try this" script, and a commit.

---

### M0.1 Repository, toolchain and dependencies

1. **Runtime.** Confirm the current Node LTS (`node --version`; install it if needed). Pin it in `.nvmrc` and `package.json` `engines`. Enable pnpm through corepack.
2. **Scaffold.** Create the repo `ua-crm` (git, branch `main`) and scaffold Vite + React + TypeScript.
3. **TypeScript.**
   - Settings: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`.
   - Path alias `@/` → `src/`, in both tsconfig and the Vite config.
   - TypeScript 7 is current. If any tool in the chain does not support it yet, pin the newest major that works and log it in `docs/DECISIONS.md`.
4. **Biome.** Turn on the recommended rules plus the a11y rules. `noExplicitAny` is an error. Format with 2-space indent and line width 100. Add `.editorconfig`.
5. **Install every dependency now,** including those for Phases 1 and 2, so later phases never stall on tooling. Only Phase 0 code imports the Phase 0 libraries; the rest are covered by smoke tests (step 9).
   - **Runtime:** `react react-dom react-router @tanstack/react-table @tanstack/react-virtual @tanstack/react-query zustand dexie zod radix-ui cmdk sonner lucide-react motion class-variance-authority clsx tailwind-merge date-fns @date-fns/tz chrono-node libphonenumber-js fastest-levenshtein exceljs jspdf jspdf-autotable pdfjs-dist tesseract.js @paddleocr/paddleocr-js @supabase/supabase-js @fontsource-variable/geist @fontsource-variable/geist-mono`
   - **Dev:** `typescript vite @vitejs/plugin-react tailwindcss @tailwindcss/vite @biomejs/biome vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom fake-indexeddb @playwright/test @axe-core/playwright lefthook tsx`
   - **Licences.** Check each package's licence and record any that is not MIT, Apache-2.0, BSD, ISC, MPL-2.0 or OFL in `DECISIONS.md` before keeping it.
6. **Scripts** in `package.json`:
   - `dev`, `build`, `preview`
   - `typecheck`, `lint`, `format`
   - `test` (unit and component), `test:watch`, `test:coverage`
   - `test:e2e`, `test:a11y`, `test:visual`, `test:visual:update` (runs inside the official Playwright Docker image), `test:perf`
   - `test:all` (lint, typecheck, coverage, e2e, a11y, visual, perf, build)
   - `tokens` (generate `tokens.css` from `tokens.ts`)
7. **Repo hygiene.**
   - `.gitignore`: `node_modules`, `dist`, `coverage`, `playwright-report`, `test-results`, `.env*` except `.env.example`, and `data/import/`.
   - `.env.example`: commented placeholders for Phases 1 and 2 (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
   - lefthook pre-commit: Biome on staged files, then typecheck.
8. **Docs.**
   - `README.md`: what it is, setup, scripts and folder map.
   - `docs/PROGRESS.md`, `docs/BACKLOG.md`, and `docs/phases/PHASE_0.md` (this file).
   - `docs/DECISIONS.md`, seeded with:
     - DOM grid over canvas, for styling and testability.
     - Vercel Hobby limits Hobby to personal non-commercial use, and the founders accepted that; the fallback is Cloudflare Pages.
     - Geist is self-hosted.
     - Dexie is the local store and the Repository is the boundary.
     - Google OAuth will use production-unverified mode.
9. **Dependency smoke tests** (`tests/unit/deps.smoke.test.ts`). Each library must load and do one real thing:
   - chrono-node parses "fri 4pm" against the fixed reference 2026-11-05 10:00 IST to Fri 6 Nov 2026 16:00 IST.
   - libphonenumber-js turns "+91 98450 12345" into `+919845012345`.
   - ExcelJS builds a workbook with one coloured cell and writes it to a buffer.
   - jsPDF with autotable renders a two-row table to an ArrayBuffer.
   - pdfjs-dist's legacy build imports in Node and exposes `getDocument`.
   - tesseract.js and `@paddleocr/paddleocr-js` resolve through dynamic import. Do not download models.
   - supabase-js `createClient` with a dummy URL does not throw.
   - `@date-fns/tz` formats a UTC instant as IST.
10. **Minimal CI** (`.github/workflows/ci.yml`): pnpm install with cache, `lint`, `typecheck`, `test`, `build`. It is extended in M0.5.

**Done when:** a clean clone runs `pnpm install`, `pnpm dev`, `pnpm test` and `pnpm build` without errors or warnings, and CI is green.

---

### M0.2 Design system and the `/design` showcase

1. **Tokens.**
   - `src/styles/tokens.ts` is the single source of truth for every token in `CLAUDE.md` §3.2 and §3.3: brand ramp, soft gradient, neutrals, semantic colours, tag palette, stage dot colours, radii, type scale, motion, in light and dark.
   - `pnpm tokens` generates `src/styles/tokens.css`: light values on `:root`, dark values on `[data-theme="dark"]`, and system mode through `prefers-color-scheme` when `data-theme="system"`.
   - Map the tokens into Tailwind v4 `@theme` so utilities read naturally (`bg-surface-subtle`, `text-secondary`, `border-border`, `bg-brand-600`, `text-warm`, `bg-warm-bg`).
2. **Fonts.** Import Geist Variable and Geist Mono Variable through Fontsource. Base UI is 14px. Turn on `tabular-nums` for numeric cells. No layout shift on load: preload the variable font files.
3. **Theme.**
   - `ThemeProvider` has three modes (system, light, dark), stored under the localStorage key `ua-crm:theme` and applied to `<html data-theme>`.
   - An inline script in `index.html` sets the attribute before first paint, so there is no flash of the wrong theme.
   - The default is system.
4. **Primitives** (`src/components/ui/`), built on Radix and styled with tokens through class-variance-authority. Every one has hover, focus-visible, active and disabled states, and works in both themes:
   - Button: primary, secondary, ghost, danger; sizes sm and md. Primary is the `--brand-600` fill with white text.
   - IconButton (requires `aria-label`).
   - Input, Textarea.
   - Kbd: renders ⌘ on macOS and Ctrl elsewhere.
   - Tabs, Menu (dropdown), Popover, Tooltip (300 ms delay, shows the shortcut if there is one), Dialog.
   - Toast: sonner, restyled, with an action slot for Undo.
   - Skeleton, Pill, Separator.
   - EmptyState, with simple abstract SVG art in the soft gradient (shapes only, no stock illustration).
5. **CRM components** (`src/components/crm/`), each with a component test:
   - **BrandLockup.** An SVG brand mark (28px rounded square, `--brand-500` fill, white "UA" monogram), the wordmark "Utopian Autonomy" (15px, 600), and an "Internal CRM" pill (12px, `--brand-700` on `--brand-50`). Generate the favicon from the same SVG. The document title is "UA · Internal CRM".
   - **WarmthChip.** States are warm, waiting, cold and empty. Empty shows a faint "Set warmth" only on row hover or focus. Clicking opens a small menu with Warm (1), Waiting (2), Cold (3) and Clear (0). `W` on the active row cycles empty → warm → waiting → cold → empty. Colours come from the semantic tokens. The accessible name is "Warmth: Cold".
   - **TagChip.** A 6px coloured dot plus the label in a neutral pill. It truncates with a tooltip when long.
   - **StageDots** (compact, in the grid).
     - 8px dots with a 4px gap.
     - Done: filled. Current: filled with a ring. Future: hollow. Lost: a red filled dot at the next position. Won: the final stage filled green.
     - Each dot has a tooltip with the stage name and date. The accessible name is "Stage 4 of 7: Plant visit".
     - Each dot exposes `data-state` for tests.
   - **StageTracker** (full, in the expanded row).
     - 14px dots joined by a 2px line: brand colour up to the current stage, `--border` after it.
     - Each stage has a 12px label and an 11px muted date underneath. A done stage that has no date shows "no date".
     - Future dots are buttons ("Move to Pilot scoped"). Earlier dots are buttons too ("Move back to First call").
     - "Mark lost" and "Reopen" controls. When lost, a line in red reads "Lost after first call · 15 Oct".
     - If the sheet has no stages, the tracker is not rendered.
   - **DateText.**
     - Exact dates render as "4 Nov" (with the year if not the current year). Fuzzy dates render as written ("Mid Oct").
     - The tooltip shows the full date and a relative phrase ("4 Nov 2026 · 1 day ago").
     - Variants: overdue (cold red) and today (`--brand-700`, "Today").
   - **AvatarInitials.** A member or contact initials circle with a deterministic tint from the tag palette.
   - **ThemeToggle.** A header icon button that cycles the three modes and whose tooltip names the current mode, plus a segmented control version for the menu.
   - **MemberTabs and SheetTabs.** Navigation tabs that move with arrow keys. The selected tab has a 2px `--text` underline. SheetTabs scroll horizontally with fading edges when they overflow, and show a subtle row count.
6. **The `/design` route.**
   - It is available only when `import.meta.env.DEV` is true or `VITE_ENABLE_TEST_HOOKS=1`.
   - It shows every primitive and CRM component in every state: colour swatches with hex values and computed contrast ratios, the type scale, the brand lockup, and stage dots and tracker in every state (early, mid, won, lost, skipped stages without dates, no stages).
   - It has a theme switch at the top, and each section has a `data-testid` for the visual tests.
7. **Contrast test** (`tests/unit/tokens.contrast.test.ts`).
   - For both themes, assert ≥ 4.5:1 for every text and background pair actually used:
     - text, text-secondary and text-muted on bg and on surface-subtle;
     - brand-700 on white;
     - white on brand-600;
     - each warmth fg on its bg;
     - the dark equivalents.
   - Assert ≥ 3:1 for meaningful graphics: hollow dot outline, done dot, won dot, lost dot, focus ring.
   - Also assert that the generated `tokens.css` is up to date with `tokens.ts`.
   - If a hex from `CLAUDE.md` fails, adjust it while keeping its intent, and log it.

**Done when:** `/design` looks polished and consistent in light and dark, every component test passes, the contrast test passes, and axe reports zero serious or critical issues on `/design` in both themes.

---

### M0.3 Domain model and local data

1. **`src/domain/` (pure TypeScript, no React, no I/O).**
   - **`types.ts` and `schemas.ts` (Zod 4)** for Member, Sheet, ColumnDef (types from `CLAUDE.md` §2.4, plus system flag, width, hidden, position), StageDef, Row, Tag, HistoryEntry, FuzzyDate, NextAction, LinkRef, CalendarEvent.
     - Rows keep core fields as typed properties and custom fields in `fields: Record<string, unknown>`, validated against the sheet's column types.
     - A row also holds stage index, a stage dates map, lost info, warmth, tag ids, next action, created and updated timestamps, created by and updated by, and `deletedAt`.
   - **`templates.ts`:** the six sheet templates exactly as in `CLAUDE.md` §2.4, including the 15 archetype options.
   - **`stages.ts`:**
     - `moveToStage(row, sheet, index, now)`: stamps the target date with today (IST). Skipped stages count as done, with no date. Moving back clears the dates after the target.
     - `markLost(row, now)` and `reopen(row)`.
     - `isWon`, and `stageState(i)` returning done, current, future, lost-marker or won.
     - Every change returns the new row plus the HistoryEntry to append.
   - **`warmth.ts`:** cycle order, labels and token names. A change returns a HistoryEntry.
   - **`dates.ts`:**
     - `parseFuzzyDate` handles "early/mid/late <month>", "<month> <year>" and plain day-month, with year inference relative to the reference date.
     - Also `formatDate` (IST, the rules in §3.5), `relative`, `isOverdue` and `isToday`.
     - Exact natural-language parsing through chrono-node is Phase 1, but leave the seam ready.
   - **`identity.ts`:**
     - `normalisePhone` (E.164, default IN), `normaliseEmail` and `linkedinSlug`.
     - `normaliseName`: lowercase, strip titles (Mr, Ms, Mrs, Dr, Cdr, Capt, Col, Prof, Shri, Smt, Er), collapse spaces, and also produce a no-space form.
     - `normaliseCompany`: strip legal suffixes only (Pvt Ltd, Private Limited, Ltd, Limited, LLP, Inc, LLC); keep words like Industries.
   - **`format.ts`:** currency in en-IN with ₹, L and Cr; plain numbers.
   - **`calendar.ts`:** `matchEventToRows(event, rows)` by attendee email, exact only for now. Name and title matching is Phase 2.
2. **`src/data/repository.ts`.** Define the full Repository interface now, including the Phase 1 methods, so the contract is settled.
   - **Implement in Phase 0:** members; sheets by member; rows by sheet (sorted); the row by id; `updateStage`, `markLost`, `reopen`, `updateWarmth` (each atomically writing the row and appending history); history by row; `search(query)` across all sheets; calendar events by member and range; `resetSampleData`.
   - **Phase 1 methods** (create, update and delete rows, columns, sheets, tags, members, import, `findDuplicates`, and so on) throw a clear `NotImplementedInPhase0` error and are not reachable from the UI.
3. **`src/data/local/`.**
   - **Dexie database** with tables `members`, `sheets`, `rows`, `tags`, `history`, `calendarEvents` and `meta`. Indexes: rows by `sheetId`, `[sheetId+position]` and `updatedAt`; history by `rowId` and `at`; events by `[memberId+start]`.
   - **Versioned schema,** so later migrations are clean.
   - **`LocalRepository`** implements the interface.
   - **`seed.ts`** is deterministic and runs on first launch (tracked by `meta.seedVersion`).
4. **Seed data.** Invented people only. No real contacts.
   - **Members:** Dawar (dawar@utopianautonomy.example) and Dhruv (dhruv@utopianautonomy.example). Use `.example` addresses.
   - **Dawar's sheets:** Customers (12 rows), Investors (6), Advisors and experts (3), Connectors (6), Service providers (4).
   - **Dhruv's sheets:** Customers (5), Investors (5), Connectors (4).
   - **Variety the seed must cover:**
     - every warmth value, and some rows with none;
     - every Customers stage reached by at least one row;
     - one won row (Paid);
     - two lost rows;
     - one row whose stages were skipped (no dates);
     - fuzzy dates ("Mid Oct", "Late Oct");
     - one overdue next action, one due today and several in the future;
     - Indian phone numbers and plausible company names across several archetypes (for example, a Hosur forging shop, a Pune casting unit, a Chennai EMS line);
     - eight tags spread across sheets.
   - **Each row** has 1 to 6 history entries between 1 Oct and 5 Nov 2026.
   - **Links:** at least three Introduced by links and three Connects to links between rows.
   - **One cross-tab pair for future duplicate tests:** "Cdr Arvind Menon" in Dawar's Connectors and "Arvind Menon" in Dhruv's Investors, with the same phone number.
   - **Calendar events:** 8 per member between 5 and 20 Nov 2026 (IST working hours), three of which have an attendee email matching a seeded row.
   - **Perf fixture:** `tests/fixtures/generateRows.ts` builds a 2,000-row Customers sheet. The dev menu and the test hook can load it.
5. **`src/data/hooks/`** wraps the Repository with TanStack Query: `useMembers`, `useSheets`, `useRows`, `useRow`, `useHistory`, `useSearch`, `useCalendarEvents`, `useMoveStage`, `useMarkLost`, `useReopen`, `useSetWarmth`.
   - Mutations are optimistic with rollback on error.
   - Every mutation shows a toast with Undo, which applies the inverse operation and records it in history.

**Done when:** every domain function has unit tests, including edge cases (year boundaries for fuzzy dates, moving back over skipped stages, lost then reopen, odd phone formats such as "098450 12345" and "+91-98450-12345", and names with titles and spacing variants). The repository passes its tests on fake-indexeddb, the seed validates against the Zod schemas, and `domain/` coverage is at least 90%.

---

### M0.4 App shell and grid

1. **Routes** (React Router 8).
   - `/` redirects to the last used member and sheet, or the first.
   - `/m/:memberSlug/:sheetSlug` is the main view, and `?row=<id>` deep-links to an expanded row.
   - `/design` is gated as in M0.2.
   - Any other path shows a friendly not-found page with a link home.
   - No sign-in yet: the open member tab decides whose calendar is shown.
2. **Layout**, from top to bottom:
   - the 3px soft gradient strip;
   - the header (52px, white, bottom hairline);
   - the sheet bar (40px);
   - the main area, holding the grid and the right panel (320px, collapsible with Ctrl/Cmd+. and remembered across reloads).
3. **Header.**
   - Left: BrandLockup.
   - Then MemberTabs (Dawar, Dhruv).
   - Right: the search trigger, a pill reading "Search" with the shortcut; ThemeToggle; and the overflow menu.
   - The overflow menu holds the keyboard shortcuts and, in development builds only, a Developer section: Reset sample data, Load 2,000-row sheet.
4. **SheetTabs** for the open member. Remember the last sheet per member (localStorage `ua-crm:last-sheet:<memberId>`).
5. **SheetGrid** (TanStack Table 9 + TanStack Virtual 3).
   - **Structure.**
     - Columns come from the sheet's visible ColumnDefs in order.
     - The header row and the Name column are sticky.
     - Rows are 40px, with hairline separators (no zebra striping).
     - Hovering a row tints it with `--surface-subtle`; the expanded row tints with `--brand-50` (dark equivalent in dark mode).
     - Rows are virtualised with dynamic measurement, so expanded rows animate height cleanly.
   - **Cells:**
     - **Name:** AvatarInitials plus the name at weight 500.
     - **Warmth:** WarmthChip.
     - **Stage:** StageDots.
     - **Tags:** TagChips, overflowing as "+2" with a tooltip.
     - **Last touch:** DateText.
     - **Next action:** the text plus a DateText with the overdue or today variant.
     - **Phone:** formatted for display.
     - **Email and URL:** plain text for now.
     - **Number and currency:** en-IN, right-aligned, tabular figures.
     - **Dropdown and multi-select:** neutral pills.
     - **Empty cells:** blank, with no placeholder dashes.
   - **Sorting.** Click a header to sort ascending, descending or none, remembered per sheet. Sort indicators are subtle.
   - **Keyboard.**
     - The grid is a single tab stop with a roving active cell, which has a visible focus ring.
     - Arrows, Home, End, Ctrl/Cmd+Home and End, PgUp and PgDn move the active cell.
     - Enter expands the active row and Esc collapses it.
     - `W` cycles warmth. `]` and `[` move the stage forward and back.
     - The grid uses ARIA grid semantics: `role="grid"`, `aria-rowcount`, `aria-rowindex`, `aria-colindex`, `aria-selected`.
6. **Expanded row** (animated, directly under the row).
   - **Left:**
     - the StageTracker, interactive and persisted with undo;
     - the WarmthChip, interactive;
     - Next action, showing text and date.
   - **Right:**
     - the five most recent history entries (kind icon, text, DateText, member), with "Show all" opening the full list in the panel;
     - Introduced by and Connects to chips that jump to the linked row, even in another member's tab.
7. **Command palette** (cmdk, Ctrl/Cmd+K).
   - **Search:** results are grouped as "Member · Sheet" and match the typed text with highlighting. Enter navigates, expands the row and briefly flashes it with `--brand-50`.
   - **Commands:** switch member, switch sheet, theme mode, toggle panel, show shortcuts.
   - The repository search uses normalised tokens across name, company, title, email, phone, tags, notes and connects to.
8. **Calendar panel: "This week".**
   - The open member's seeded events, grouped by day ("Today", "Fri 6 Nov").
   - Each event shows its time (IST), title and, if matched, a contact chip that jumps to the row.
   - When there are no events in the range, show an empty state. Do not show a "Connect calendar" button; that arrives in Phase 2.
9. **Shortcut sheet.** `?` opens a dialog listing every shortcut from `CLAUDE.md` §3.1 that works in Phase 0.
10. **Feedback and states.**
    - Loading skeletons for the tabs and the grid.
    - Toasts with Undo for stage and warmth changes.
    - A top-level error boundary with a calm message and a reload button.
    - Empty-sheet state: "No one here yet." Leave out the quick-add hint until Phase 1.
11. **Polish pass.** Check spacing on the 4px grid, alignment, truncation with tooltips, the focus ring on every control, reduced-motion behaviour, and the layout at 1024px wide. Light and dark should feel equally designed, not like dark is an afterthought.

**Done when:** the demo script in `PROGRESS.md` works end to end, and the M0.5 tests pass.

---

### M0.5 Quality gates and CI

**Playwright setup.**
- **Projects:** `desktop` (Chromium at 1440×900), `narrow` (Chromium at 1024×768), and `webkit-smoke` (the main flow only).
- **Environment:** every test freezes the clock to `2026-11-05T10:00:00+05:30` and uses timezone `Asia/Kolkata` and locale `en-IN`.
- **Isolation:** each test gets a fresh browser context, so IndexedDB starts empty and the seed is reapplied.
- **Hooks:** enable the test hooks with `VITE_ENABLE_TEST_HOOKS=1` (the `/design` route and loading the perf sheet).

**End-to-end specs** (`tests/e2e/`):
1. `branding.spec`: "Utopian Autonomy" and "Internal CRM" are visible; the document title is right; the favicon is present.
2. `navigation.spec`:
   - Switching from Dawar to Dhruv shows Dhruv's sheets.
   - Switching sheets updates the URL and the grid.
   - After a reload, the last sheet per member is restored.
   - A deep link with `?row=` opens that row expanded.
3. `stage.spec`:
   - Expanding a Customers row and clicking a future stage moves the dots and stamps "5 Nov".
   - The Undo toast reverts the change.
   - Mark lost shows the lost line and a red dot; Reopen clears it.
   - After a reload, the state persists.
   - Using `]` and `[` on the active row gives the same results.
4. `warmth.spec`: choosing from the menu and cycling with `W` both persist across reload; Undo works.
5. `search.spec`:
   - Ctrl/Cmd+K, then typing "menon", shows both Arvind Menon rows with their member and sheet labels.
   - Enter navigates across tabs and expands the row.
   - Esc closes the palette.
6. `keyboard.spec`: a keyboard-only journey (tab to the grid, arrows, Enter, `W`, `]`, Esc, `?`, Ctrl/Cmd+.) never needs the mouse and never loses focus.
7. `theme.spec`:
   - The default follows the system setting (emulate both light and dark).
   - The toggle cycles the modes, and the choice persists across reload.
   - There is no flash of the wrong theme: assert `data-theme` is set before the first paint, using a script check.
8. `calendar-panel.spec`: Dawar's tab shows Dawar's events; Dhruv's tab shows Dhruv's; a matched event's chip jumps to the contact.
9. `console.spec`: visiting every main screen produces no console errors or warnings.

**Accessibility** (`tests/a11y/`): run axe on the main screen (collapsed and expanded), on the command palette open, and on `/design`, each in light and dark. There must be zero serious or critical violations.

**Visual regression** (`tests/visual/`).
- **Snapshots,** each in light and dark: the main screen on Dawar's Customers sheet; the same with a row expanded; the command palette with results; `/design` captured section by section; the narrow 1024px main screen.
- **Baselines** are generated only inside the official Playwright Docker image whose tag matches the installed Playwright version (`pnpm test:visual:update`), and committed. Keep the diff threshold tight.

**Performance smoke** (`tests/perf/`).
- Load the 2,000-row sheet. The first rows must be visible within 1.5 s of navigation on CI hardware.
- Scroll to the bottom with the keyboard (Ctrl/Cmd+End); the last row is reachable and rendered.
- No long task over 200 ms while scrolling, measured with a PerformanceObserver.

**CI** (`.github/workflows/ci.yml`).
- On every push and pull request to `main`, with the pnpm store cached:
  - **Job `quality`:** lint, typecheck, unit and component tests with coverage (fail if `domain/` is below 90% or overall below 70%), and the build.
  - **Job `browser`:** runs in the Playwright container matching the installed version. It runs e2e, a11y, visual and perf.
- On failure, upload the Playwright HTML report and traces as artifacts.

**Done when:** `pnpm test:all` passes locally, and both CI jobs are green on `main`.

---

## Phase 0 acceptance checklist

- [ ] A clean clone plus `pnpm install` and `pnpm dev` gives a working app with no console errors.
- [ ] Every dependency for all phases is installed, licence-checked and smoke-tested.
- [ ] The header shows the UA brand mark, "Utopian Autonomy" and "Internal CRM". The tab title and favicon are correct.
- [ ] White is the dominant surface. The UA blue appears only for action, selection, progress and the brand. The soft gradient appears only in the top strip and empty-state art.
- [ ] Member tabs, sheet tabs, the grid with every cell type, row expansion, the stage tracker, warmth, search, the calendar panel, the shortcut sheet and the theme toggle all work by keyboard and by mouse.
- [ ] Stage and warmth changes persist across reload, can be undone, and appear in history.
- [ ] `/design` shows every component in every state, in light and dark.
- [ ] Unit, component, e2e, a11y, visual and perf tests all pass. Coverage thresholds are met. CI is green.
- [ ] `docs/PROGRESS.md` has the demo script. `docs/DECISIONS.md` lists every decision and non-MIT licence. Screenshots are saved per milestone.

## Report at the end of Phase 0

Stop here and reply with:
1. What was built, milestone by milestone, in a few lines each.
2. How to run it, and the demo script to click through (copied from `PROGRESS.md`).
3. Test results: counts per layer, coverage numbers, and the CI run link.
4. Paths to the light and dark screenshots of the main screen and an expanded row.
5. Every decision taken and every deviation from `CLAUDE.md` or this brief, with the reason.
6. Known issues, and anything the founders need to decide before Phase 1.
7. Suggested changes to the Phase 1 plan based on what was learned.

Do not start Phase 1. Phase 1's brief will be written after the founders review this demo.
