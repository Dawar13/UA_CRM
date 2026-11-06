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
