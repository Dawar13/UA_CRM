# Decisions

Dated technical decisions, with the licence record required by `CLAUDE.md` §1. Product decisions belong to the founders and are noted here only when they constrain a technical choice. New entries go at the bottom; superseded entries are marked, not deleted.

Format: **Context** (why a choice was needed), **Decision** (what we chose), **Consequences** (what follows, including the costs).

---

## D-001 · 5 Nov 2026 · The grid renders as DOM, not canvas

**Context.** The grid is the heart of the app. Canvas grids scroll fast but draw their own text, so custom cells (warmth chips, stage dots, tag pills, Radix tooltips and menus) look foreign. They are also invisible to Testing Library, Playwright locators and axe.

**Decision.** TanStack Table 9 for the model and TanStack Virtual 3 for row virtualisation, rendered as ordinary DOM with our own keyboard layer. Canvas-rendered grids are banned (`CLAUDE.md` §4).

**Consequences.** Every cell is a real React component styled with tokens, reachable by tests and by assistive technology. Performance depends on virtualisation and cheap cells, so a 2,000-row perf smoke test guards it (M0.5).

## D-002 · 5 Nov 2026 · Hosting on Vercel Hobby, with Cloudflare Pages as the fallback

**Context.** The ₹0 running-cost rule needs free hosting for a static build plus a few serverless functions (OAuth token exchange in Phase 2). Vercel's Hobby plan is limited to personal, non-commercial use.

**Decision.** The founders accepted the Hobby terms for this internal tool. Vercel hosts the static build and the `api/` functions from Phase 1. The fallback is Cloudflare Pages with Pages Functions.

**Consequences.** Keep `api/` functions small and framework-free (standard `Request`/`Response` handlers) so a move to Cloudflare is mechanical. Revisit if UA's use of the tool changes or Vercel's terms change.

## D-003 · 5 Nov 2026 · Geist and Geist Mono are self-hosted

**Context.** The type system uses Geist and Geist Mono. The Google Fonts CDN is banned (privacy, and no third-party requests).

**Decision.** Use `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (OFL-1.1). Vite bundles the woff2 files and, in builds, preloads the Latin variable files (see D-012).

**Consequences.** No external font requests, and the same fonts locally, in CI and in production. Visual baselines are made in Linux Docker so rendering is identical across machines (D-019).

## D-004 · 5 Nov 2026 · Dexie is the local store and the Repository is the boundary

**Context.** Phase 0 needs persistent data with no accounts. Phase 1 moves to Supabase and must not touch the UI.

**Decision.** `src/data/repository.ts` defines the full Repository interface, including the Phase 1 methods, which throw `NotImplementedInPhase0`. `LocalRepository` implements it on Dexie 4 (IndexedDB) with a versioned schema. Components never import Dexie or Supabase; they call TanStack Query hooks, which call the Repository.

**Consequences.** Phase 1 adds a `SupabaseRepository` behind the same interface. Repository tests run on `fake-indexeddb`. Dexie stays useful later as an offline cache.

## D-005 · 5 Nov 2026 · Google OAuth runs in production mode without verification

**Context.** In Testing mode, Google refresh tokens expire after 7 days, which would force members to reconnect their calendar every week. Verification for the `calendar.events` scope is slow and unnecessary for a team of two.

**Decision.** Phase 2 sets the Google Cloud app to "In production" without verification. Members see Google's unverified-app screen once. Refresh tokens live server-side only (a Supabase table readable only by the service role), and token exchange and refresh run in Vercel functions.

**Consequences.** The app is capped at 100 users, far above need. OAuth uses redirects, not popups, so the COOP/COEP headers needed for threaded WASM OCR cannot break sign-in (`CLAUDE.md` §2.12).

## D-006 · 5 Nov 2026 · Node 26.13.0 LTS, with pnpm 12.16.1 through corepack

**Context.** The brief asks for the current Node LTS, pinned. Node 26.13.0 ("Lithium") became the active LTS on 28 Oct 2026. Node 26 no longer bundles corepack.

**Decision.** Pin `26.13.0` in `.nvmrc` and `"engines": { "node": ">=26.13.0 <27" }`, enforced by `engineStrict: true`. On the development machine Node is installed with fnm. corepack 0.36.0 is installed globally (`npm install --global corepack@0.36.0`) and pins pnpm 12.16.1 through the `packageManager` field. CI installs corepack the same way (D-021).

**Consequences.** A wrong Node major fails `pnpm install` immediately instead of later. Every new machine needs the one-off corepack install; the README says so.

## D-007 · 5 Nov 2026 · pnpm 12 settings live in pnpm-workspace.yaml, with dependency builds blocked by default

**Context.** pnpm 12 reads project settings from `pnpm-workspace.yaml` (`.npmrc` is for auth and registry only) and blocks dependency install scripts unless they are allowed.

**Decision.** `pnpm-workspace.yaml` holds `engineStrict: true` and an explicit `allowBuilds` map:

| Package      | Allowed | Why                                                                |
| ------------ | ------- | ------------------------------------------------------------------ |
| core-js      | no      | Its postinstall only prints a funding banner                       |
| protobufjs   | no      | Its postinstall only warns about version-range style in dependents |
| tesseract.js | no      | Its postinstall only prints an Open Collective banner              |
| esbuild      | yes     | Its postinstall verifies the native binary that `tsx` relies on    |
| lefthook     | no      | The `prepare` script installs the git hooks instead                |

pnpm's default `minimumReleaseAge` (1 day) is kept as a supply-chain guard. A few packages therefore resolved one patch behind the very latest: @tanstack/react-query 5.105.3, @supabase/supabase-js 2.118.0, lucide-react 1.68.0, @biomejs/biome 2.6.4 and Vite 8.3.5.

**Consequences.** Installs are quiet and run no surprise code. A new dependency with a needed build script must be added to `allowBuilds` and logged here.

## D-008 · 5 Nov 2026 · TypeScript 7.0.2 is kept

**Context.** TypeScript 7 (the native port) ships no JavaScript compiler API yet, and `CLAUDE.md` §4 says to pin an older major if a tool needs one.

**Decision.** Keep 7.0.2. Nothing in our chain needs the JS API: Vite 8 transforms with Oxc and bundles with Rolldown, Vitest transforms through Vite, Playwright and tsx transpile on their own, and Biome is native. The TS 6/7 default changes are handled explicitly: `types` is listed, `rootDir` is set, there is no `baseUrl` (paths are relative), and `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` and `noFallthroughCasesInSwitch` are on.

**Consequences.** `tsc -b` is fast. If a future tool needs the TS JS API, pin TypeScript 6 for that tool only and log it.

## D-009 · 5 Nov 2026 · Biome 2.6 rules

**Context.** One fast tool for lint and format, with the a11y rules on.

**Decision.** The `recommended` preset plus the a11y group at preset `all`. `noExplicitAny` is an error. 2-space indent, line width 100, single quotes, no semicolons. `!important` is allowed only in `src/styles/globals.css`, for the reduced-motion block. lefthook runs Biome on staged files, then the typecheck, before each commit.

**Consequences.** Accessibility lint failures block commits, which suits WCAG 2.2 AA (`CLAUDE.md` §3.6).

## D-010 · 5 Nov 2026 · Only design tokens are usable as colours in Tailwind

**Context.** `CLAUDE.md` §3.2 makes white dominant and limits colour to meaning. Tailwind's default palette makes off-system colours too easy to use.

**Decision.** Tailwind 4.3's default colour palette is removed in `@theme`, so only tokens exist as utilities. `src/styles/tokens.ts` is the single source of truth, and `pnpm tokens` generates `src/styles/tokens.css` (light on `:root`, dark on `[data-theme="dark"]`, system through `prefers-color-scheme`). A unit test fails if `tokens.css` is stale.

**Consequences.** A class like `bg-blue-500` simply does not exist. Adding a colour means adding a token, which goes through the contrast test.

## D-011 · 5 Nov 2026 · Contrast adjustments to the CLAUDE.md palette

**Context.** `CLAUDE.md` §3.2 requires at least 4.5:1 for text and 3:1 for meaningful graphics, tested rather than assumed, and says to adjust a failing hex while keeping its intent.

**Decision.**

| Token             | Theme | Was           | Now           | Reason                                                      |
| ----------------- | ----- | ------------- | ------------- | ----------------------------------------------------------- |
| `--border-strong` | light | #8A9399       | #858E94       | 2.99:1 on `--surface-subtle` (hollow stage dots need 3:1)   |
| `--text-muted`    | light | #6B737A       | #687078       | 4.48:1 on the brand-50 expanded-row tint                    |
| `--border-strong` | dark  | #5E6A72       | #66737B       | 2.88:1 on `--surface-raised`                                |
| Focus ring        | light | `--brand-400` | `--brand-600` | `--brand-400` is 2.27:1 on white, below the 3:1 floor       |
| Focus ring        | dark  | `--brand-400` | unchanged     | 8.39:1                                                      |
| Selected-row tint | dark  | (none given)  | #0B2230       | The dark equivalent of `--brand-50`                         |
| `--lost` (text)   | light | #DC2626       | #D92525       | 4.49:1 on the expanded-row tint; the lost dot keeps #DC2626 |

Tokens added while building the design system: `--surface-hover` (#F1F4F8 light, #1F2D37 dark) for menu-item and button hover, keeping muted text at 4.56:1 and 4.68:1; and `--danger`, `--danger-hover`, `--danger-fg` (#B91C1C / #991B1B light, #DC2626 / #B91C1C dark, white text at 4.8:1 or more) for the danger button.

**Consequences.** `tests/unit/tokens.contrast.test.ts` enforces every pair in both themes.

## D-012 · 5 Nov 2026 · The favicon comes from a small Vite plugin; fonts are not preloaded

**Context.** The favicon must be the brand mark (`CLAUDE.md` §3.4). The Phase 0 brief asked for the variable fonts to be preloaded to avoid layout shift.

**Decision.** `src/assets/brand/brandMark.ts` produces the brand-mark SVG for both the in-app mark and the favicon. A Vite plugin injects the favicon as a data-URI SVG. The UA monogram is drawn as strokes, not text, so it renders identically without fonts. Font preloading was built and then removed: WebKit logs "preloaded but not used" warnings for the Geist preloads a few seconds after load (Geist Mono is not on the main screens), and preloading only Geist sans still warned. That breaks the no-console-warnings rule (D-018) and the WebKit smoke tests.

**Consequences.** One source for the mark; replacing the logo later means changing `src/assets/brand/` only. **Deviation from the brief:** without a preload, the first uncached visit can show a brief font swap. The Latin files are about 30 KB from the same origin, and later visits come from the cache. Revisit with `font-display` tuning or metric-matched fallbacks if the founders notice it.

## D-013 · 5 Nov 2026 · Undoing a stage change restores an exact snapshot

**Context.** Undo must not lose information. Replaying the inverse move would re-stamp or clear the dates of skipped or earlier stages.

**Decision.** Undo uses `restoreStage`, which restores the previous stage index, stage-dates map and lost info exactly. The undo is itself recorded in history.

**Consequences.** Moving forward over skipped stages and then undoing returns exactly the earlier state, dates included.

## D-014 · 5 Nov 2026 · The grid's active cell uses aria-activedescendant

**Context.** The grid is one tab stop with a roving active cell, and rows are virtualised, so the active cell's DOM node can unmount while scrolling.

**Decision.** Focus stays on the `role="grid"` container, which points at the active cell with `aria-activedescendant`. Real focus never moves into cells.

**Consequences.** Focus is never lost when a virtualised row unmounts. Cells need stable ids derived from row and column.

## D-015 · 5 Nov 2026 · Licence audit of every dependency

**Context.** `CLAUDE.md` §1 allows only permissive or OSI licences (MIT, Apache-2.0, BSD, ISC, MPL-2.0, OFL) and requires every dependency's licence to be logged.

**Decision.** Audited with `pnpm licenses list --json` (production and development, transitive included): 474 packages. 459 carry a licence on the allowed list (MIT 399, Apache-2.0 23, ISC 15, BSD-3-Clause 14, MPL-2.0 4, BSD-2-Clause 2, OFL-1.1 2). The other 15 are listed below. There is **no GPL, AGPL or LGPL-only package**. Platform-specific binaries installed on Linux or macOS (Biome, Rolldown, Lightning CSS, Tailwind Oxide) carry the same licences as the Windows ones audited here.

**Direct dependencies**

| Package                         | Version | Licence           | Kind    |
| ------------------------------- | ------- | ----------------- | ------- |
| @date-fns/tz                    | 1.5.0   | MIT               | runtime |
| @fontsource-variable/geist      | 5.3.0   | OFL-1.1           | runtime |
| @fontsource-variable/geist-mono | 5.3.0   | OFL-1.1           | runtime |
| @paddleocr/paddleocr-js         | 0.4.2   | Apache-2.0        | runtime |
| @supabase/supabase-js           | 2.118.0 | MIT               | runtime |
| @tanstack/react-query           | 5.105.3 | MIT               | runtime |
| @tanstack/react-table           | 9.3.1   | MIT               | runtime |
| @tanstack/react-virtual         | 3.14.26 | MIT               | runtime |
| chrono-node                     | 2.10.3  | MIT               | runtime |
| class-variance-authority        | 0.7.1   | Apache-2.0        | runtime |
| clsx                            | 2.1.1   | MIT               | runtime |
| cmdk                            | 1.1.1   | MIT               | runtime |
| date-fns                        | 4.4.0   | MIT               | runtime |
| dexie                           | 4.4.7   | Apache-2.0        | runtime |
| exceljs                         | 4.4.0   | MIT               | runtime |
| fastest-levenshtein             | 1.0.16  | MIT               | runtime |
| jspdf                           | 4.2.1   | MIT               | runtime |
| jspdf-autotable                 | 5.0.9   | MIT               | runtime |
| libphonenumber-js               | 1.13.15 | MIT               | runtime |
| lucide-react                    | 1.68.0  | ISC               | runtime |
| motion                          | 14.9.1  | MIT               | runtime |
| pdfjs-dist                      | 6.5.438 | Apache-2.0        | runtime |
| radix-ui                        | 1.8.1   | MIT               | runtime |
| react                           | 19.3.1  | MIT               | runtime |
| react-dom                       | 19.3.1  | MIT               | runtime |
| react-router                    | 8.5.1   | MIT               | runtime |
| sonner                          | 2.0.8   | MIT               | runtime |
| tailwind-merge                  | 3.7.0   | MIT               | runtime |
| tesseract.js                    | 7.0.0   | Apache-2.0        | runtime |
| zod                             | 4.6.7   | MIT               | runtime |
| zustand                         | 5.0.16  | MIT               | runtime |
| @axe-core/playwright            | 4.14.0  | MPL-2.0           | dev     |
| @biomejs/biome                  | 2.6.4   | MIT OR Apache-2.0 | dev     |
| @playwright/test                | 1.64.1  | Apache-2.0        | dev     |
| @tailwindcss/vite               | 4.3.4   | MIT               | dev     |
| @testing-library/dom            | 10.4.2  | MIT               | dev     |
| @testing-library/jest-dom       | 7.0.1   | MIT               | dev     |
| @testing-library/react          | 16.3.3  | MIT               | dev     |
| @testing-library/user-event     | 14.6.8  | MIT               | dev     |
| @types/node                     | 26.6.6  | MIT               | dev     |
| @types/react                    | 19.3.0  | MIT               | dev     |
| @types/react-dom                | 19.3.0  | MIT               | dev     |
| @vitejs/plugin-react            | 6.2.1   | MIT               | dev     |
| @vitest/coverage-v8             | 5.1.0   | MIT               | dev     |
| fake-indexeddb                  | 6.2.7   | Apache-2.0        | dev     |
| jsdom                           | 30.1.3  | MIT               | dev     |
| lefthook                        | 2.2.2   | MIT               | dev     |
| pg (added in Phase 1, D-032)    | 8.23.1  | MIT               | dev     |
| @types/pg (Phase 1, D-032)      | 8.23.1  | MIT               | dev     |
| supabase (CLI, Phase 1, D-032)  | 3.0.0   | MIT               | dev     |
| tailwindcss                     | 4.3.4   | MIT               | dev     |
| tsx                             | 4.23.15 | MIT               | dev     |
| typescript                      | 7.0.2   | Apache-2.0        | dev     |
| vite                            | 8.3.5   | MIT               | dev     |
| vitest                          | 5.1.0   | MIT               | dev     |

**Transitive licences outside the plain list**

| Licence                          | Package                                                                        | Pulled in by                                 | Kind    | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (MIT OR GPL-3.0-or-later)        | jszip 3.10.2                                                                   | exceljs                                      | runtime | Dual licence; we use it under MIT. Accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| (MPL-2.0 OR Apache-2.0)          | dompurify 3.4.17                                                               | jspdf                                        | runtime | Dual licence; we use it under Apache-2.0. Accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| (MIT AND Zlib)                   | pako 1.0.11, 2.2.0                                                             | jszip (exceljs); fast-png (jspdf)            | runtime | Both permissive. Accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 0BSD                             | tslib 2.8.1, 2.9.1                                                             | @supabase/*                                  | runtime | Public-domain-equivalent BSD. Accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| BSL (Boost Software License 1.0) | clipper-lib 6.4.2                                                              | @paddleocr/paddleocr-js                      | runtime | `package.json` says "BSL"; the source header confirms Boost 1.0 (permissive, OSI), not the Business Source License. Accepted.                                                                                                                                                                                                                                                                                                                                                                                   |
| Python-2.0                       | argparse 2.0.1                                                                 | js-yaml (@paddleocr/paddleocr-js)            | runtime | PSF licence: permissive, OSI. Only js-yaml's CLI uses it, so it never reaches the bundle. Accepted.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Unlicense                        | big-integer 1.6.52                                                             | unzipper (exceljs)                           | runtime | Public-domain dedication. Accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| MIT/X11                          | chainsaw 0.1.0                                                                 | binary (unzipper, exceljs)                   | runtime | MIT under its older name. Accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **None declared**                | **buffers 0.1.1**                                                              | **binary 0.3.0 (unzipper 0.10.14, exceljs)** | runtime | **No licence field and no LICENSE file, and the upstream repository (substack/node-buffers) no longer exists, so no licence can be verified.** Mitigation: ExcelJS's browser build (`dist/exceljs.min.js`, which Vite bundles) contains no unzipper code. `buffers` is reachable only from ExcelJS's Node-only streaming reader, so it is installed but never shipped to users. Accepted as low risk; revisit if ExcelJS moves to an unzipper release without `binary`, or if we ever use the streaming reader. |
| MIT OR Apache-2.0                | @biomejs/cli-win32-x64 2.6.4                                                   | @biomejs/biome                               | dev     | Dual permissive. Accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| MIT-0                            | @csstools/color-helpers 6.1.2, @csstools/css-syntax-patches-for-csstree 1.1.16 | jsdom                                        | dev     | MIT without the attribution clause. Accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| BlueOak-1.0.0                    | lru-cache 11.5.3                                                               | jsdom                                        | dev     | Permissive model licence (OSI-approved). Accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| CC0-1.0                          | mdn-data 2.27.1                                                                | css-tree (jsdom)                             | dev     | Public-domain dedication for data. Accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

The four MPL-2.0 packages (axe-core and @axe-core/playwright for tests; lightningcss and its Windows binary inside the Vite and Tailwind build) are used unmodified as tools and are never shipped, so MPL's file-level copyleft has nothing to apply to.

Playwright's downloaded browsers and its ffmpeg build (LGPL) are test-machine tools, not npm dependencies, and are never distributed.

**Consequences.** Re-run the audit whenever a dependency is added or a major version changes, and add any licence outside the allowed list to the table above before keeping the package.

## D-016 · 5 Nov 2026 · Only the browsers we test are installed locally

**Context.** The founders asked to avoid unnecessary downloads. Playwright 1.64.1 offers Chromium (full and headless shell), Firefox and WebKit.

**Decision.** Locally, install only the Chromium headless shell (`pnpm exec playwright install --only-shell chromium`, Chrome for Testing 156) and WebKit 27.2 (`pnpm exec playwright install webkit`, about 170 MB on disk). There is no Firefox project. CI uses the official Playwright image, which already contains the browsers, so CI never runs `playwright install`.

**Consequences.** Headless runs only (the headless shell cannot run headed). For headed debugging, install full Chromium on demand.

## D-017 · 5 Nov 2026 · Playwright projects and the shared test environment

**Context.** M0.5 asks for a desktop project, a narrow project, a WebKit smoke project, a frozen clock, IST, en-IN, and fresh storage per test.

**Decision.** `playwright.config.ts` defines `desktop` (Chromium 1440×900), `narrow` (Chromium 1024×768) and `webkit-smoke` (Desktop Safari, only tests tagged `@smoke`). All use `timezoneId: 'Asia/Kolkata'`, `locale: 'en-IN'` and a light colour scheme by default. The web server builds the app into `dist-e2e` with `VITE_ENABLE_TEST_HOOKS=1` and serves it with `vite preview` on port 4173, so tests run against a production build. `tests/support/fixtures.ts` freezes `Date` to 5 Nov 2026, 10:00 IST with `page.clock.setFixedTime` before navigation (timers still run).

**Consequences.** Specs import `test` and `expect` from `tests/support/fixtures.ts`. Under Playwright's clock, an exception thrown inside a timer callback is reported as a console error rather than a `pageerror`. The console guard (D-018) catches both.

## D-018 · 5 Nov 2026 · Browser tests fail on any console error or warning

**Context.** The Definition of Done (`CLAUDE.md` §6) allows no console errors or warnings in the browser.

**Decision.** An automatic fixture collects console errors, console warnings and uncaught page errors in every browser test. A test that otherwise passes fails if any were collected. A test that provokes one on purpose opts out with `test.use({ failOnConsoleIssues: false })` and asserts on `consoleIssues`.

**Consequences.** Console noise is caught where it starts, not only in `console.spec`. Third-party warnings must be fixed or explicitly allowed in the spec that triggers them.

## D-019 · 5 Nov 2026 · Visual baselines are generated only in the official Playwright Linux image

**Context.** Font rendering and anti-aliasing differ between Windows, macOS and Linux. Baselines made on one machine fail on another.

**Decision.** Baselines are generated in `mcr.microsoft.com/playwright:v<installed version>-noble`, either locally with `pnpm test:visual:update` (Docker) or in CI with the manual "Visual baselines" workflow, which commits them to the branch it runs on (and also uploads them as an artifact). The visual specs skip themselves on Windows and macOS rather than compare against Linux pixels, so `pnpm test:all` can pass locally; CI enforces them. Snapshot paths have no platform suffix: `tests/visual/__screenshots__/<project>/<spec path>/<name>.png`. Thresholds are tight: `maxDiffPixelRatio: 0.001`, with animations disabled, the caret hidden and CSS-pixel scale.

**Consequences.** The CI `browser` job is the reference. Until the workflow has run once, the visual step in CI fails with missing snapshots; after an intentional visual change, run the workflow again and pull.

## D-020 · 5 Nov 2026 · Node 26 inside the Playwright image comes from the official tarball

**Context.** The Playwright image ships an older Node, while `engines` with `engineStrict` require Node 26.13.0. The host's `node_modules` (Windows binaries) must never be used inside Linux.

**Decision.** `scripts/visual-update.ts` reads the Playwright version from `node_modules/@playwright/test/package.json` and the Node version from `.nvmrc`. It bind-mounts the repo at `/work` and gives `/work/node_modules` its own named Docker volume. Inside the container it downloads the official `node-v26.13.0-linux-<arch>.tar.gz`, checks it against nodejs.org's `SHASUMS256.txt`, and caches it with corepack, pnpm and the pnpm store in a second named volume. It then runs `corepack enable` and `pnpm install --frozen-lockfile --ignore-scripts`, so the container never rewrites the host's git hooks, before running the visual tests with `--update-snapshots`. It stops with a clear message if Docker is missing or not running.

**Consequences.** The first run pulls the image (about 2 GB) and Node (about 50 MB). Later runs reuse both volumes. The approach works on x64 and arm64 hosts. Other options were rejected: nvm or `pnpm env` would add another moving part, and a custom image would need maintenance.

## D-021 · 5 Nov 2026 · CI installs pnpm through corepack, exactly as on a developer machine

**Context.** pnpm 12 is a native binary distributed through npm. CI must use the same pnpm the lockfile was written with, and Node 26 does not bundle corepack.

**Decision.** A local composite action (`.github/actions/setup`) runs `actions/setup-node@v7` with `.nvmrc` (its own package-manager cache off), installs corepack 0.36.0, runs `corepack enable`, caches the pnpm store with `actions/cache@v6`, keyed on `pnpm-lock.yaml`, and runs `pnpm install --frozen-lockfile`. `ci.yml` has two parallel jobs. `quality` (lint, typecheck, coverage with thresholds, build) runs on `ubuntu-latest`. `browser` (e2e, a11y, visual, perf) runs in `mcr.microsoft.com/playwright:v1.64.1-noble` and uploads the HTML report and traces on failure. Actions are on their current majors: checkout v7, setup-node v7, cache v6, upload-artifact v7. Runs on the same branch cancel each other.

Container jobs first make sure git is installed (otherwise checkout falls back to a plain download with no `.git`), and the setup action marks the workspace as a safe git directory, so `lefthook install` and the baseline commit work.

**Consequences.** When `@playwright/test` is upgraded, update the container tag in `ci.yml` and `visual-baselines.yml` in the same commit, then regenerate the baselines.

## D-022 · 5 Nov 2026 · The grid opens in the CLAUDE.md §2.1 column order

**Context.** With the side panel open at 1440px the grid has about 1,120px. In `CLAUDE.md` §2.3 definition order, Warmth, Stage and Next action fall off-screen.

**Decision.** `buildSheetSchema` assigns default positions that match the §2.1 layout diagram: Name, Warmth, Stage, Tags, Last touch, Next action, then Company, Title, Phone, Email, the template's extra columns, and the hidden columns. LinkedIn, Links, Next date, Introduced by, Connects to, Notes and Files are hidden by default; Next date is hidden because the Next action cell already shows its date. Widths: Name 220, Warmth 104, Stage 124, Tags 240, Last touch 100, Next action 280.

**Consequences.** The at-a-glance columns fit at 1440px with the panel open. Column order and visibility become editable in Phase 1 (column manager). This is a visible default for the founders to confirm.

## D-023 · 5 Nov 2026 · Domain conventions settled in Phase 0

**Decision.**

- Currency values are stored in rupees as plain numbers (₹25 L = 2,500,000) and shown with `formatCurrency`, including "Ticket estimate (₹ L/yr)".
- Customers turnover bands: < ₹50 Cr, ₹50–250 Cr, ₹250–1,000 Cr, > ₹1,000 Cr. `CLAUDE.md` names the column but not the bands; founders to confirm.
- Moving forward stamps the target stage with today (IST); never-reached stages in between become done with no date. Moving back keeps the target's original date and removes the dates after it.
- `markLost` on a row with no stage records `lost.stageIndex = 0` and leaves `stageIndex` null; `effectiveStageIndex` gives the stage to display. `markLost` on a lost row and `reopen` on an open row throw.
- Every stage and warmth change is a touch and updates `lastTouchAt`. History `at` is kept strictly increasing per row, so newest-first order is stable under a frozen clock.

## D-024 · 5 Nov 2026 · Grid performance: memoised rows and lightweight overlays

**Context.** The perf smoke (2,000 rows, no long task over 200 ms while scrolling) failed: each row mounted about ten Radix roots (a tooltip per stage dot, tag and date, plus the warmth menu), so a fresh screen of 33 rows cost about 300 ms.

**Decision.** Rows are a memoised `GridRow` with stable handlers, so moving the active cell re-renders two rows. `Tooltip` is a light in-house component (same props, `role="tooltip"`, 300 ms delay, hoverable, one open at a time) that renders only its child until shown, and `TooltipDelegate` gives each row of stage dots one tooltip instead of seven. `WarmthChip` is a plain button until the first pointer-down or key press, then mounts the Radix menu already open. Formatted phone numbers are cached. The calendar panel's contact matching waits until the browser is idle.

**Consequences.** A fresh 33-row screen costs 15–20 ms in an interleaved A/B bench (was 81–113 ms). Radix is still used for menus, dialogs and tabs.

## D-025 · 5 Nov 2026 · Two Biome a11y rules are off for the grid folder

**Context.** Biome's a11y group runs at preset `all`. `useSemanticElements` asks for native `<table>` elements and `useFocusableInteractive` asks for every `gridcell` to be focusable.

**Decision.** Both are off for `src/features/grid/**` only. The grid is a virtualised CSS-grid layout (a native table cannot position rows absolutely) that follows the WAI-ARIA grid pattern with `aria-activedescendant` (D-014), where cells are deliberately not focusable.

**Consequences.** axe (`tests/a11y`) still checks the grid's roles and names in both themes.

## D-026 · 5 Nov 2026 · Interaction choices in the Phase 0 shell

**Decision.**

- One click on a row expands it (clicks on controls inside cells don't); Enter does the same from the keyboard.
- The "This week" panel shows today and the next six days. With no events it says "A clear week"; there is no "Connect calendar" button until Phase 2.
- Menus are non-modal: a modal menu hides the page from assistive technology, which axe flags as serious.
- Focus is never dropped: dialogs opened by shortcuts return focus to what had it; after a jump from search or a link chip the grid takes focus on the expanded row; after a stage move, Mark lost or Reopen, focus stays in the tracker; "Back to this week" focuses the panel heading.
- The Developer menu (Reset sample data, Load 2,000-row sheet) exists only in development builds; tests use `window.__uaTest`, which exists only when test hooks are on.

## D-027 · 5 Nov 2026 · The founders' redesign (M0.6): blue palette, field palette, folders

**Context.** After Phase 0 the founders found the shell generic. Over four prototype rounds they chose a calmer, more art-like look from their own references: a navy-to-white blue palette, an earthy dot-chart palette (olive, ochre, brick, sand), sheets as folders, squarer corners and joined shapes instead of pills and dots.

**Decision.**

- Sheets are folders. Each tab is a blue two-stop gradient from the palette (01 deepest, 05 lightest, then repeating). The active tab joins a folder front: a summary of the sheet (People, Open pipeline or This week, Won or Next actions, Due) and a pipeline card. Clicking the active tab folds the front to one line; the choice is remembered.
- The pipeline is one long tapered capsule: thickness follows how many people reached each stage, bands step through the blue palette, and pills show the share that moved on. Squares under it show who is at each stage now, by warmth, shaded by recency.
- Warmth uses the field palette: olive (warm), ochre (waiting), brick (cold), as soft gradient chips. CLAUDE.md §2.2 semantics are unchanged.
- The stage column is a joined bar beside the stage name; the tracker uses the same blocks.
- The side panel adds a 30-day dot field: touches held stack up in deepening greens, a blue dot marks a stage move, and missed next actions hang below a sand line from ochre to brick. Until the calendar arrives (Phase 2), "missed" means an exact-dated next action that passed with no touch since.
- Rows are 52px and two lines (name, then title and company). Company and Title are therefore hidden by default (the Phase 1 column manager can show them). The header is 56px. Corners are 4 / 6 / 8 / 10px. The 3px top strip is removed.
- In the expanded row, warmth is a radio group of three soft chips: arrow keys move focus without choosing (so browsing does not log warmth changes); Space or Enter chooses, choosing the selected chip clears it, and 1, 2, 3 and 0 still work. `[` and `]` also work inside the tracker. Skipped tracker blocks use stripes tinted to 40% so their text keeps 4.5:1.

**Consequences.** CLAUDE.md §2.1 and §3.2–3.4 are rewritten to match. All visual baselines change and are regenerated in CI. The Phase 0 seed version is bumped so existing browsers reseed with the new column widths (sample data only).

## D-028 · 5 Nov 2026 · Contrast: text everywhere, supplementary fills judged by eye

**Context.** The new stage ramp starts very light (#CAF1F8) and the field palette has pale steps by design, so these fills cannot reach 3:1 on white.

**Decision.** The contrast test checks every text pair, including text on each folder colour, stage block, chip gradient stop and the today chip, in both themes, plus focus rings and hollow outlines at 3:1. Stage cells, warmth squares and activity dots are not held to 3:1, because each sits beside text that says the same thing (stage names, warmth labels, counts, tooltips and accessible summaries). Adjusted to pass: text-muted #68747D → #646F78 (4.47:1 on row-selected); dark folder text from #F2F7FA to white (4.45:1 → 4.82:1 on #0078B7).

**Consequences.** Colour is never the only signal; component tests check that the stage label is always rendered.

## D-029 · 5 Nov 2026 · Member-wide reads for the activity field

**Decision.** The Repository gains `listMemberRows(memberId)` and `listMemberHistory(memberId, range)`, behind hooks `useMemberRows` and `useMemberHistory`; row mutations invalidate both. The pure `activityByDay` (domain) turns them into 30 days of held, moved and missed, and `summariseSheet` (domain) computes the folder front from a sheet's rows.

**Consequences.** Phase 1's SupabaseRepository must implement the two reads (one query each, filtered by the member's rows).

## D-030 · 6 Nov 2026 · An opened row goes to the top of the grid

**Context.** CI's visual test of the expanded row was flaky after M0.6. With the folder front open, a row's details are taller than the visible rows, and `scrollToIndex(…, 'auto')` aligned the end of the row once its details were measured: on a fast machine the grid landed with the row and its stage tracker cut off, on a slow one it stayed at the top. People opening a row from search saw the same jump.

**Decision.** Opening a row (deep link, search jump, click or Enter) aligns it to the top of the grid, just under the header, with its details below. Start alignment depends only on the fixed-height rows above it, so the grid always lands in the same place. No scroll is issued when the row is already there (a no-op scroll raced with focus returning from the search dialog in WebKit). The visual tests also wait for the side panel's idle-loaded 30-day field and contact chips, and give `/design` sections up to 15 s to settle.

**Consequences.** An e2e test checks that a deep-linked row opens from its top on desktop and at 1024px. The expanded-row visual baselines change once more.

## D-031 · 6 Nov 2026 · A spreadsheet-like grid and a true funnel

**Context.** The founders asked for smaller, more Excel-like cells with visible lines, and a pipeline that reads as a funnel rather than a capsule.

**Decision.**

- Rows are single-line and 36px (compact 30px), with 13px text, a gridline on every row and column (`--grid-line`: #DCE3E8 light, #22303A dark) and a shaded 32px header row (`--grid-header`). The name cell is a small monogram and the name, so Company and Title are visible columns again (reverting that part of D-027); the seed version is 3 so open browsers pick it up.
- Rows use CSS layout and paint containment, and the virtualizer keeps 6 rows (was 12) above and below the screen: shorter rows mean each mouse-wheel step mounts a whole new screen, and this keeps the 2,000-row scroll under the 200 ms long-task limit. Tooltips and menus render in portals, so containment clips nothing.
- The pipeline is a horizontal funnel: a flat, full-height mouth at the first stage, sides that narrow through each stage boundary in proportion to how many reached it (monotone Fritsch–Carlson curves, so they never bulge) and a rounded spout at the last stage anyone reached. The blue stage bands and the conversion pills are unchanged.

**Consequences.** All grid and summary visual baselines change once more.

## D-032 · 6 Nov 2026 · Phase 1 setup: Vercel Hobby, a public repository, no local stack

**Context.** At the end of M1.0 the founders answered the four plan questions (`docs/phases/PHASE_1_PLAN.md` §5).

**Decision.**

- **Hosting is Vercel Hobby**, chosen by the founders knowing that its terms are written for personal, non-commercial use. Phase 1 needs only the static build; previews build against staging, production releases are manual.
- **The repository stays public** (`Dawar13/UA_CRM`), so GitHub Actions minutes stay free. Nothing secret or real is ever committed (CLAUDE.md §1); the nightly backups go to the private `ua-crm-backups` repository.
- **No local Supabase stack.** Docker is not installed on the development machine. The `db` CI job starts local Supabase on GitHub's runners and runs the pgTAP policy tests there (contract and live tests join it in M1.1). Development and manual checks run against the staging project. Migrations are checked locally on PGlite (Apache-2.0, a scratch tool, not a project dependency) before they are pushed.
- **Email and password sign-in exists only in the local config (CI) and on staging,** for the two test users. Production allows Google only.
- **Dependencies:** the Supabase CLI (`supabase`, MIT) and `pg` (MIT) with `@types/pg` (MIT) as dev dependencies, for migrations, CI and the integration tests. The `buffers` package that ExcelJS pulls in is accepted.
- **Turnover bands** for Customers are to change; the new bands are awaited from the founders.

**Consequences.** Database changes are proven in CI rather than on the machine, so each migration is pushed with its pgTAP tests and checked on PGlite first.

## D-033 · 6 Nov 2026 · Sign-ups are gated by the members list, not switched off

**Context.** Supabase blocks every new user, Google sign-ins included, when sign-ups are disabled. A member added by an admin would then need a user created with the secret key, which the browser must never hold.

**Decision.** Sign-ups stay on, and a `before_user_created` auth hook (`public.hook_before_user_created`) refuses every email that is not an active member. Row-level security is the second wall: `current_member_id()` matches the JWT email against active members, so a user without a membership reads and writes nothing. The hook is enabled in `supabase/config.toml` for CI and must be switched on in both hosted projects (Authentication → Hooks).

**Consequences.** Adding a member is one insert by an admin; their first Google sign-in creates their user. Deactivating a member blocks both new sign-ups and every read and write at once. pgTAP covers the hook for an active member, a deactivated member and a stranger.

## D-034 · 6 Nov 2026 · Names without initials

**Context.** The founders asked for the initials tile beside every name to go: in dark mode it read as a black box, and the name says it already.

**Decision.** Names stand alone everywhere a person appears: grid rows, search results, link chips in the expanded row, contact chips on calendar events and the member switch in the header. `AvatarInitials`, the `initials()` helper, the avatar gradient tokens and the Avatars section of `/design` are removed. Chips that held a tile keep their shape with even padding.

**Consequences.** New surfaces that name a person (the Today view, the account menu, the Team dialog) show the name as text, with no tile. The visual baselines for the grid, the header, the palette and `/design` change, and the `design-avatars` baselines are gone.

## D-035 · 6 Nov 2026 · Email sign-in, one Supabase project, MSME turnover bands

**Context.** The founders want a better spreadsheet first and light sign-in: "we don't need very hard sign ins". Google sign-in needs a Google Cloud OAuth app before anyone can sign in, and the plan had a second Supabase project for staging. They also chose the turnover bands that D-032 left open.

**Decision.**

- **Sign-in is email and password** through Supabase Auth. Sign-ups are off; an admin creates each login in the Supabase dashboard ("Auto Confirm User"). Each person signs in once per browser and the session persists. Google sign-in joins in Phase 2, when the Calendar needs a Google app anyway; the same email keeps the same member.
- **One Supabase project** (`ua-crm`), with no staging project. Previews run on sample data in local mode. The pgTAP, contract and live tests run against the local Supabase that CI starts, so testing does not need a hosted second project.
- **Strangers still get nothing.** Row-level security matches the signed-in email against active members, so a login without a membership reads and writes nothing. The `before_user_created` hook (D-033) stays in the schema and in the CI config as a second guard; it no longer needs switching on in the hosted project.
- **The first members** are added once in the Supabase SQL editor, which runs without a member and passes the members guard. Real emails never go into a migration or seed, because the repository is public.
- **Turnover bands** follow India's MSME turnover limits as revised in 2025: Micro < ₹10 Cr, Small ₹10–100 Cr, Medium ₹100–500 Cr, Large > ₹500 Cr. The column widens to 180px to fit. Sample rows moved to the nearest band and the seed version is 5, so local data reseeds.

**Consequences.** Founder setup drops to about 10 minutes and needs no Google Cloud project. Adding a member is two steps: the member row in the app, then their login in the dashboard. This supersedes the staging project in D-032 and the hosted hook setup in D-033.

## D-036 · 6 Nov 2026 · Supabase reads and writes go through SQL functions shaped like the domain

**Context.** The UI talks only to the Repository (CLAUDE.md §5). The Supabase implementation must return the same `Sheet`, `Row` and `HistoryEntry` shapes as the local one, enforce ownership in the database, and stay fast from India to the Tokyo region.

**Decision.**

- Reads and writes are `api_*` SQL functions that return domain-shaped JSON (`ua_sheet_json`, `ua_row_json` and friends). They are **security invoker**, so row-level security decides every row; the few security-definer helpers (`api_me`, `api_tag_usage`) return only what the caller may already see.
- A row and its tags, links and history entry save in one call (`api_save_row`), so a stage or warmth change and its history are one transaction (CLAUDE.md §5).
- `SupabaseRepository` runs the same pure domain functions as `LocalRepository` and checks `can()` before every write, so a refusal reads the same in both modes; the database refuses again if the check is bypassed (pgTAP, and the live forced-write test).
- One Repository contract suite runs against both implementations (40 scenarios).

**Consequences.** Most screens load in one round trip per query. The functions are part of the schema, so each change ships as a migration with pgTAP tests.

## D-037 · 6 Nov 2026 · Live updates, and no lost saves

**Context.** Other members' changes must appear without moving focus or scroll (CLAUDE.md §2.14), and an edit must never be lost (§3.1).

**Decision.**

- Realtime `postgres_changes` on the ten app tables refresh the open queries in one batch, 300 ms after the last change, and wait while the member's own saves are in flight, so a refresh never overwrites an optimistic edit.
- Row-level security hides trashed rows from other members, so Realtime cannot tell them a row left. The member who trashes sends a bare "changed" broadcast with no data, and every open app refreshes.
- Every edit is optimistic. While a save is in flight, closing or reloading the tab asks first (`beforeunload`). The live browser tests found that a new row took three round trips and a quick reload dropped it; adding a row now reads its sheet, the actor and the next position in parallel, then saves.

**Consequences.** A change shows on another screen in about a second. The leave-page prompt appears only in the moment a save is still travelling.

## D-038 · 6 Nov 2026 · One undo stack per session

**Context.** "No save buttons; every edit can be undone" (CLAUDE.md §3.1), across cells, rows, columns, stages and imports.

**Decision.** A Zustand stack of inverse operations (`src/lib/undoStack.ts`): each mutation pushes its own undo and redo, built from the saved result (an exact patch, a restore from Trash, or a stage snapshot as in D-013). Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z work anywhere outside a text field; destructive actions also show an 8-second toast with Undo.

**Consequences.** Undo lasts for the session, not across reloads. Trash keeps deleted things for 30 days beyond that.

## D-039 · 6 Nov 2026 · Quick-add, smart paste and the duplicate check are deterministic

**Context.** CLAUDE.md §1 bans AI APIs; §2.6 and §2.7 define the language and the duplicate levels.

**Decision.**

- The parser (`src/domain/quickadd/`) is pure TypeScript over chrono-node (dates, IST, forward-dated) and libphonenumber-js (region IN, E.164). It reports a confidence per field for the preview. Unrecognised text goes to Notes.
- Drafts persist in local storage per sheet until committed.
- The duplicate check scores candidates with one scorer (`src/domain/dedupe/`): hard on equal phone, email or LinkedIn slug; soft on Jaro-Winkler ≥ 0.92 over normalised names (also compared without spaces) or on the same first name and company. In Supabase mode the database narrows the candidates first (`api_dedupe_candidates`: generated key columns and `pg_trgm`), across every member's rows; the browser scores them. "Different person" pairs are remembered per member.

**Consequences.** The same input always gives the same preview, in tests and in the app. The 0.92 threshold is a constant and can be tuned from real data.

## D-040 · 6 Nov 2026 · Files, Trash purge, import and export

**Decision.**

- **Files** go to a private Storage bucket, `row-files`, at `<owner>/<row>/<file id>`, 10 MB each, opened through short-lived signed URLs. Storage policies follow the row's owner. In local mode (sample data, previews, tests) a file is kept in IndexedDB as a data URL.
- **Trash** keeps rows, columns and sheets for 30 days. A pg_cron job, `ua-purge-trash`, deletes older ones every night at 02:00 IST.
- **Import and export run in the browser.** ExcelJS reads and writes `.xlsx`; CSV is parsed in-house. Column mappings are remembered per sheet in local storage. PDFs use jsPDF's standard fonts, which have no rupee sign, so a PDF writes "Rs 25 L" where the grid and Excel show "₹25 L"; embedding a font for one glyph was not worth the size.

**Consequences.** No server code for files, import or export; the free tier's 1 GB Storage is the only limit that grows with use.

## D-041 · 6 Nov 2026 · Releases are built in GitHub Actions; Vercel only hosts

**Superseded by D-046** (7 Nov 2026).

**Context.** The toolchain is Node 26 and pnpm 12 (§4). Vercel's build image documents older Node majors, and a pnpm override there falls back to an old pnpm. Production releases are manual (D-035).

**Decision.** The Release workflow (`.github/workflows/release.yml`, run by hand on `main`) refuses a commit whose CI has not passed, builds with the CI toolchain, assembles a Build Output API folder (`scripts/release/vercel-config.json`: SPA fallback except under `/assets/`, immutable asset caching, basic security headers) and deploys it with `vercel deploy --prebuilt`. A preview runs on sample data; production applies migrations first. The Vercel project has no Git connection. The Vercel CLI (Apache-2.0) is pinned at 65.3.1 and fetched with `pnpm dlx` inside the workflow only.

**Consequences.** Vercel never builds, so a Vercel image change cannot break a release. Setup and secrets are in `docs/RUNBOOK.md`.

## D-042 · 6 Nov 2026 · Nightly backups with a nightly restore check

**Context.** M1.8 asks for a nightly dump into the private `ua-crm-backups` repository (keeping 30), a restore tested once into a scratch project, and a note on backing up Storage files within free limits. This repository's Actions logs are public.

**Decision.**

- **Database:** at 02:00 IST the Supabase CLI dumps roles, schema and data (pg_cron's run log left out), gzipped, into `db/<date>/` with a `counts.txt` of rows per table. The run fails if the dump has no members, which catches a wrong connection string. The tree keeps the newest 30 dumps; older ones stay in git history.
- **Files:** `scripts/backup/storage-mirror.ts` mirrors the bucket into `files/`, downloading only new files, with a manifest of content types; `storage-restore.ts` uploads it back. Git stores each file once however many nights it is backed up, and the 1 GB Storage cap with 10 MB files keeps the repository inside GitHub's limits. Both scripts were exercised against the hosted bucket with an invented file before launch.
- **Restore, tested every night** rather than once: the dump is restored into a scratch local Supabase on the runner and every table's row count is compared with `counts.txt`.
- **Safety:** the workflow refuses a backup repository that is not private; every step prints counts, never names or data; psql errors are shown with quoted values masked. Dumps are not encrypted beyond the private repository (an encryption passphrase is a backlog option).

**Consequences.** A broken backup fails loudly the same night, and the restore in `docs/RUNBOOK.md` is the one the check runs. The daily dump also keeps the free project from pausing. The dump and restore steps need Docker, so they were first run on GitHub's runners, not on the development machine.

## D-043 · 6 Nov 2026 · Live browser tests against Supabase

**Decision.** `tests/e2e-live` (its own Playwright config, `pnpm test:e2e:live`) runs in the CI `db` job against the local stack: two invented members and a stranger sign in with email and password; view only; a write forced from the browser console is refused by the database; Realtime delivers the other member's new row. With test hooks on (never in production builds), the signed-in client is exposed as `window.__uaSupabase` for the forced write; anyone can build the same client from the publishable key, so it exposes nothing the policies do not already guard. The setup refuses a project with real members, and the run removes its users afterwards.

**Consequences.** The suite also ran once against the hosted project before launch, when it had no members, and found the lost-save gap in D-037.

## D-044 · 6 Nov 2026 · The founders' UA logo is the brand mark

**Context.** The founders asked for their logo in place of the M0.6 placeholder mark (a sky-gradient square with a drawn "UA").

**Decision.** The mark and the favicon use `Favcon_Utopian.png` (a white U and striped A on grainy UA blue, 2000px), cropped to a square around the monogram and scaled with Lanczos: `src/assets/brand/ua-mark.png` at 112px (the 28px mark at 4x, 15 KB) and `ua-favicon.png` at 64px, inlined into the page head. `BrandMark` is now an image with empty alt text; the wordmark beside it carries the name. The sky-gradient token stays for the open member and accents.

**Consequences.** Changing the logo again means replacing the two PNGs. Tests that described the placeholder (a gradient and the text "UA") now check the image and the PNG favicon.

## D-045 · 7 Nov 2026 · Fixes from the end-of-phase run

**Context.** The full end-of-phase run (every Vitest project, every Playwright project, accessibility and the 2,000-row performance smoke) found problems that the per-milestone runs had not.

**Decision.**

- **Smart paste versus a spreadsheet column.** M1.6 sent any multi-line paste without tabs to quick add, which also caught a single column copied from a spreadsheet (one name per line) and broke M1.3's paste. `isContactText` (`src/domain/quickadd/smartPaste.ts`) now sends text to quick add only when it carries a way to reach someone (an email, a phone number, a web address) or a quick-add `key:`, and never when the clipboard holds an HTML table.
- **IST dates by arithmetic.** `istDateOf` and `todayIst` ran a time-zone formatter on every call, about 176 ms while summarising a 2,000-row sheet. IST is a fixed UTC+5:30, so the date is now computed from the shifted instant; the results are identical (the boundary tests at 18:30 UTC still pass). The formatter remains only for displayed times.
- **Class-name cache.** tailwind-merge's cache grows from 500 to 2,000 entries; scrolling the grid creates more distinct class strings than 500.
- **Tests corrected, not loosened.** The performance smoke expected 2,001 grid rows; your own tab has had the "Add a contact" line since M1.3, so it is 2,002. The stage-editor test clicked the folder-front shortcut, which a folded front (short screens start folded) does not show; it now uses the sheet menu when the front is folded. The performance limits (first rows under 1.5 s, no long task over 200 ms) are unchanged.

**Consequences.** On the development machine the performance smoke sits close to its limits (first rows 1.0 to 1.2 s in isolation, but up to 1.8 s while another process held two of its cores; scroll tasks 130 to 210 ms). CI's runner gives the reference result. If it fails there, the next steps are lighter grid cells (fewer class merges and elements per cell) and layout containment on rows.

## D-046 · 7 Nov 2026 · Vercel builds from the repository; pushing to main is the release

**Context.** The founders asked for less setup ("don't over-engineer"). D-041 built releases in GitHub Actions because Vercel's Node 26 support was unconfirmed, which cost a release workflow, a Vercel token and five more GitHub settings. Vercel's documentation now lists Node 26 as its default.

**Decision.**

- Vercel imports `Dawar13/UA_CRM` and builds it on every push to `main`. `vercel.json` pins pnpm 12.16.1 through `npx` (the version in `packageManager`), skips the `prepare` script (git hooks are for developers), keeps the SPA fallback outside `/assets/`, and sets caching and security headers.
- Production gets three Vercel environment variables (`VITE_DATA`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`); branch previews get none, so they run on sample data.
- Pushing is the manual release (D-035): the founders push by hand. Migrations are applied with `supabase db push --remote` before the code that needs them is pushed.
- The release workflow, its Build Output config and the Vercel CLI pin are removed. The nightly backup is unchanged (the founders chose to keep the private backup repository); its repository name now defaults to `<owner>/ua-crm-backups`, so it needs four secrets and no variables.

**Consequences.** Setup is: import the repository in Vercel with three variables, and for backups one private repository, one token and four secrets. CI no longer gates production; a push that fails CI is still deployed, so wait for CI before pushing behaviour changes, or roll back in Vercel.

## D-047 · 7 Nov 2026 · First use: light by default, side panel closed, flat empty states, one-line menus

**Context.** The founders' first session on the live app.

**Decision.**

- **Light by default.** The theme starts as Light, not System, until someone chooses otherwise (in the app and in the pre-paint script in `index.html`, so there is no flash). The toggle cycles Light → Dark → System.
- **Side panel closed by default.** It opens with its button or Ctrl/Cmd+.; the choice is remembered. Browser tests that read the panel open it through a fixture option (`startWithPanel`), and `tests/e2e/defaults.spec.ts` covers the first visit.
- **Empty states** drop the glowing card, floating dots and soft gradient for a flat mark: a 4 × 3 grid of hairline cells with a staircase of stage blues, drawn from tokens so it follows the theme.
- **Menus.** 21 menu items had their icon inside the label, where Tailwind's base styles render an SVG as a block, so the text sat on a line below the icon. Each now uses the item's `icon` slot, and `tests/unit/menuIcons.test.ts` fails if an icon goes back inside a label.

**Consequences.** The visual baselines change (theme default does not affect them, since visual tests set the theme; the empty-state mark and menus do).

## D-048 · 7 Nov 2026 · The stage tracker: stages passed are hatched, the current one solid

**Context.** The founders liked the hatched "pencil" texture of skipped stages and asked for it on every stage passed, with the current stage solid.

**Decision.** In the expanded row's tracker, a stage passed is drawn as 135° hatching: 1.5px stripes of its ramp colour mixed 45% with the page, over a ground mixed 18%, so the shade deepens from the first stage to the last. Its name and date are in --text. The current stage stays solid in its ramp colour with its contrast-tested text and the ring. Skipped stages, which were the only hatched ones, become faint grey hatching (--grid-line over --stage-track) with "Skipped" in --text-secondary, so they no longer read as passed. The grid's small stage bar is unchanged.

**Consequences.** The contrast test now checks --text on both the stripe and the ground of every stage's hatching, and the skipped label on its hatching, in both themes. It caught the first mix (55%) at 4.33:1 in dark mode on stage 6; 45% passes everywhere.

## D-049 · 7 Nov 2026 · Cell formatting: fill colours, wrapped columns, row heights

**Context.** The founders asked for text wrapping, light cell colours and taller rows; columns could already be resized.

**Decision.**

- **Data.** Migration `20261107150000_cell_format.sql` adds `rows.cell_colours` (jsonb, column key to a tag hue), `rows.height` (36 to 240 px, null for the default) and `columns.wrap`. `ua_row_json`, `ua_sheet_json`, `api_save_row` and `api_save_sheet` are their previous definitions with only these fields added. In the domain they are optional (`cellColours`, `height`, `wrap`), so the app reads a database without the migration; formatting is then simply not kept. Colours and height are cell edits like any other: one patch, owner only, with Undo.
- **Fill colour.** Right-click a cell (or press the menu key) in your own tab: a swatch row of the eight tag hues, each mixed 22% with the page, plus No fill. With several rows selected, the same column of every selected row is filled. The contrast test checks --text on every fill in both themes.
- **Wrap text.** A column setting, from the column menu or the right-click menu. A wrapped column shows its whole text on as many lines as it needs; while any column wraps, rows grow to fit (their height is a minimum).
- **Row height.** Drag the bottom edge of a row's first cell; double-click it, or use Reset row height, to go back. Taller rows start their text at the top.
- Another member's tab has no format menu and no row handles (view only).

**Consequences.** The hosted database needs the migration (`supabase db push`) for formatting to be kept. The grid's row heights are measured (they already were, for the expanded row), so performance at 2,000 rows is unchanged when nothing is formatted.

## D-050 · 7 Nov 2026 · Google Calendar: its own connection, synced on the server

**Context.** Phase 2 part 1. The founders kept email sign-in and wanted their real Google Calendar in the CRM, live, with an expanded view.

**Decision.**

- **Connecting is separate from signing in.** "Connect Google Calendar" (side panel or the ⋯ menu) runs its own OAuth: authorization code with PKCE and a one-time state that expires in 10 minutes, by redirect, never a popup. Scopes `openid email https://www.googleapis.com/auth/calendar.events.owned`, with `access_type=offline`, `prompt=consent` and `login_hint`. The callback refuses a token without the calendar scope or without a refresh token, and reads the Google email from the `id_token`. If the founders' check shows invitations missing, `GOOGLE_CALENDAR_SCOPE` switches to `calendar.events` without a code change.
- **A small server.** Vercel functions in `api/` (connect, callback, sync, disconnect, next-action-event, webhook, and the daily job), Web-standard handlers. Google is called with `fetch`; no `googleapis` package. Every handler takes the member from their own Supabase token, never from the request.
- **Tokens never reach the browser.** Refresh tokens are sealed with AES-256-GCM under a versioned key (`CALENDAR_TOKEN_KEY`, `CALENDAR_TOKEN_KEY_VERSION`; older keys stay readable through `CALENDAR_TOKEN_KEYS_PREVIOUS`) in `calendar_secrets`, which no client role can read. Logs carry ids, counts and error codes only: no titles, emails or names.
- **Database** (`20261108090000_calendar.sql`): `calendar_connections`, `calendar_events` and `calendar_event_links` (each member reads only their own), `calendar_secrets` and `oauth_states` (no client access). Calendar history is written only by definer functions the server's key may call, which check the row's owner and write one entry per event and row. Rows gain the next action's event id, time and state.
- **Sync.** The primary calendar, series expanded. The first sync covers 5 Nov 2026 00:00 IST to 60 days ahead; later ones start 14 days back (or one day before the last sync after a gap), never before 5 Nov; events that ended over 30 days ago are dropped. One sync per member at a time (a 90-second lock); Google's rate limits and server errors are retried with backoff; a revoked token asks the member to reconnect; any other failure keeps the last good data and says so. Triggers: opening the app when the last sync is over 5 minutes old, every 15 minutes while it is visible, Sync now (repeats within a minute return the last result), Google push (D-051) and a daily job at 00:30 UTC.
- **Meetings log themselves.** An ended event that is not cancelled, declined or a CRM next action, and whose guest email matches one of the member's own rows (or a suggestion they confirmed), becomes a Meeting entry in that row's history, once.
- **Next actions in the calendar.** Add to calendar needs an exact day: all day, or a time for 30 minutes; the contact is invited only when asked (`sendUpdates=all` then, `none` otherwise). Later CRM edits update the event, a fuzzy or cleared date removes it, and Undo brings it back. A move made in Google sets the CRM date with a system note, but only when Google changed the event since the last sync, so a CRM edit is never undone by a sync that crosses it. An event deleted in Google leaves the next action marked "Removed in Google Calendar" with Add again.
- **Sample mode** (previews and browser tests) has no Google: its calendars start connected with the sample events, Connect comes straight back, and next-action events are written locally by the same rules.

**Consequences.** The founders create a Google Cloud project and eight Vercel variables (`docs/RUNBOOK.md` §7); with the app "In production" but unverified, each member sees Google's warning once and at most 100 accounts can connect. The hosted database needs the migration before the code is pushed. No new dependencies. TypeScript 7 has no JavaScript compiler API; Vercel's Node builder (`@vercel/node` 30) carries its own TypeScript 5.9 and esbuild for `api/`, so the functions should build as they are, and the first deployment confirms it. Relative imports in `api/` and the calendar domain files it uses end in `.js`, as Node's ESM needs. Locally, `pnpm dev` serves `/api` through a small Vite plugin from the same files.

## D-051 · 7 Nov 2026 · Live updates through Google's push notifications

**Context.** The founders wanted changes in Google Calendar to show without waiting for the 15-minute poll.

**Decision.** On connecting, the server opens a watch channel on the member's primary calendar for 7 days, addressed to `/api/calendar/webhook`, with a random token stored only as its SHA-256. The webhook checks the channel and the token (constant time), answers Google's opening "sync" message without work, and otherwise syncs that member; Realtime then refreshes their open app. The daily job renews channels with under 2 days left, so one missed run costs nothing. If Google refuses the address, the code is kept in the connection's last result and polling carries on. Development on localhost never asks for push.

**Consequences.** On Vercel Hobby the daily job is the only cron, which the 2-day margin covers. Whether Google accepts the production address without domain verification is part of the founders' first check (`docs/RUNBOOK.md` §7.4).

## D-052 · 7 Nov 2026 · The calendar page, and calendars private to their member

**Context.** The founders asked for an expanded calendar like Google Calendar's week view; the brief makes each calendar private.

**Decision.**

- **`/calendar`** shows the signed-in member's week, Monday to Sunday in IST: an hour is 48px and the morning is in view, overlapping events sit side by side, all-day events have their own row, today is shaded with a line at the current time, each event's contacts jump to their rows, and its title opens it in Google Calendar. Left and right arrows (or the buttons) move a week; the week is in the address. It reads and links only; changing events stays in Google Calendar. It opens from a Calendar item after Today in the member switch, the side panel's expand button and the ⋯ menu.
- **Private calendars.** Another member's tab says "Dhruv's calendar is private" where the week would be; their 30-day activity stays. This holds in sample mode too, so the browser test that read Dhruv's week as Dawar now signs in as Dhruv.
- **Suggestions.** When no guest matches, a title naming exactly one of your own contacts (a full name, or a company of four or more letters) shows "Rohan Mehta?" with yes and no. Yes links the event to the row, so its meeting is logged there; no keeps it from being suggested again.
- **Today** lists today's meetings first; an expanded row shows the next meeting with that contact.

**Consequences.** The header gains an item, so visual baselines change, as does `/design` (a Calendar section).
