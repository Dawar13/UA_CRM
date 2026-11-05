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
