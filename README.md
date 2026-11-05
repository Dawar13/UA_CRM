# UA Internal CRM

The internal CRM for **Utopian Autonomy**. It tracks every relationship the company depends on: customer plants, investors, advisors, connectors and service providers. It works like a calm, fast spreadsheet. Each row is a person, with warmth, stage, tags, a next action and a dated history.

- **Users:** the UA founding team (Dawar and Dhruv to start).
- **Constraints:** ₹0 running cost, no AI or LLM APIs, and no real contact data in git.
- **Status:** Phase 0, a walking skeleton on invented sample data stored in the browser (IndexedDB). No accounts are needed. Supabase, sign-in and editing arrive in Phase 1.

Read [`CLAUDE.md`](CLAUDE.md) for the full product model, design rules and tech stack.

## Prerequisites

- **Node 26.13.0 (LTS).** The version is pinned in `.nvmrc`, and `engines` with `engineStrict` enforces it. With fnm: `fnm install && fnm use`; with nvm: `nvm install && nvm use`.
- **corepack 0.36.** Node 26 no longer bundles corepack, so install it once: `npm install --global corepack@0.36.0`. corepack then provides pnpm 12.16.1, pinned by `packageManager`.
- **Git.**
- **Docker** (optional), only to regenerate visual baselines with `pnpm test:visual:update`.

## Setup

```sh
corepack enable
pnpm install                                          # also installs the lefthook git hooks
pnpm exec playwright install --only-shell chromium    # headless Chromium for browser tests
pnpm exec playwright install webkit                   # WebKit for the @smoke project
pnpm dev                                              # http://localhost:5173
```

No environment variables are needed in Phase 0. `.env.example` lists the Phase 1 and 2 placeholders. Copy it to `.env.local` when they are needed, and never commit real values.

## Scripts

| Script                    | What it does                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm dev`                | Vite dev server with hot reload                                                              |
| `pnpm build`              | Typecheck (`tsc -b`), then production build into `dist/`                                     |
| `pnpm preview`            | Serve the production build                                                                   |
| `pnpm typecheck`          | `tsc -b` over the app and the tooling projects                                               |
| `pnpm lint`               | Biome lint and format check                                                                  |
| `pnpm format`             | Biome fix and format, writing changes                                                        |
| `pnpm test`               | Unit and component tests (Vitest, once)                                                      |
| `pnpm test:watch`         | Vitest in watch mode                                                                         |
| `pnpm test:coverage`      | Unit and component tests with coverage; fails below 70% lines overall or 90% in `src/domain` |
| `pnpm test:e2e`           | Playwright end-to-end specs (`desktop`, `narrow`, and `webkit-smoke` for `@smoke` tests)     |
| `pnpm test:a11y`          | axe accessibility specs (`desktop`)                                                          |
| `pnpm test:visual`        | Visual regression specs (`desktop`, `narrow`); the baselines are Linux-only, see below       |
| `pnpm test:visual:update` | Regenerate visual baselines inside the official Playwright Docker image                      |
| `pnpm test:perf`          | Performance smoke on the 2,000-row sheet (`desktop`)                                         |
| `pnpm test:all`           | Lint, typecheck, coverage, e2e, a11y, visual, perf and build: everything CI runs             |
| `pnpm tokens`             | Regenerate `src/styles/tokens.css` from `src/styles/tokens.ts`                               |

The Playwright scripts build the app with test hooks on (`VITE_ENABLE_TEST_HOOKS=1`) into `dist-e2e/` and serve it on port 4173. Locally, a server already running on that port is reused.

## Testing

| Layer         | Tool                             | Where              | What it covers                                                                                          |
| ------------- | -------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| Unit          | Vitest (Node)                    | `tests/unit/`      | `src/domain`, formatters, parsers, repository on fake-indexeddb, token contrast, dependency smoke tests |
| Component     | Vitest + Testing Library (jsdom) | `tests/component/` | Each CRM component's states, keyboard behaviour and ARIA                                                |
| End to end    | Playwright                       | `tests/e2e/`       | Real flows in the browser, with reloads to prove persistence                                            |
| Accessibility | @axe-core/playwright             | `tests/a11y/`      | Main screens and `/design`, light and dark: zero serious or critical violations                         |
| Visual        | Playwright `toHaveScreenshot`    | `tests/visual/`    | Main screens and `/design`, light and dark                                                              |
| Performance   | Playwright                       | `tests/perf/`      | 2,000-row sheet: first paint, scroll to bottom, no long tasks                                           |

Every browser test imports `test` and `expect` from `tests/support/fixtures.ts`. Those fixtures freeze the clock to Thu 5 Nov 2026, 10:00 IST, run in the `Asia/Kolkata` timezone with the `en-IN` locale, and fail a test on any console error or warning.

**Visual baselines** are generated only inside the official Playwright Linux image, so fonts render the same everywhere. Use `pnpm test:visual:update` (needs Docker; the first run pulls about 2 GB) or the manual **Visual baselines** workflow on GitHub Actions, which uploads the new baselines as an artifact.

**CI** (`.github/workflows/ci.yml`) runs on every push and pull request to `main`. The `quality` job runs lint, typecheck, coverage and build. The `browser` job runs e2e, a11y, visual and perf in the Playwright container.

## Folder map

```
CLAUDE.md                  project context: product model, design rules, stack, ways of working
docs/
  phases/PHASE_0.md        the active phase brief
  PROGRESS.md              log per milestone: done, how to try it, known issues, next
  DECISIONS.md             dated technical decisions and the licence audit
  BACKLOG.md               ideas and feedback not yet scheduled
  screenshots/             light and dark captures per milestone
src/
  app/                     App, router, providers, layout shell, error boundary
  components/ui/           primitives (Button, Tabs, Menu, Popover, Tooltip, Dialog, Toast, ...)
  components/crm/          BrandLockup, MemberTabs, SheetTabs, WarmthChip, TagChip, StageDots, ...
  features/                grid, row-detail, calendar-panel, command-palette, design (/design);
                           quick-add, dedupe, today, import-export (Phase 1); file-import (Phase 2)
  domain/                  pure TypeScript: types, Zod schemas, templates, stages, warmth, dates,
                           identity normalisers, formatters (no React, no I/O)
  data/
    repository.ts          the Repository interface: the only way the UI touches data
    local/                 Dexie database, LocalRepository, seed
    supabase/              SupabaseRepository (Phase 1)
    hooks/                 TanStack Query hooks over the Repository
  lib/                     small helpers (cn, env, keyboard, storage)
  styles/                  tokens.ts (source of truth), generated tokens.css, globals.css
  assets/brand/            brand mark (also the favicon)
tests/
  unit/  component/        Vitest
  e2e/  a11y/  visual/  perf/   Playwright
  support/                 shared Playwright fixtures and helpers
  setup/                   Vitest setup files
  fixtures/                test data generators (2,000-row sheet)
api/                       Vercel functions (Phase 1 and 2)
supabase/migrations/       database migrations (Phase 1)
scripts/                   token generator, visual-baseline updater, one-off importers
data/import/               real files for runtime import; gitignored, never committed
.github/                   CI workflows and the shared setup action
```

## Ways of working

- Work moves in phases, milestones and stories. Each milestone ends with green tests, light and dark screenshots, a "try this" entry in `docs/PROGRESS.md`, and a commit.
- Commits use conventional messages (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). The lefthook pre-commit hook runs Biome on staged files and the typecheck.
- Technical decisions and every new dependency's licence go in `docs/DECISIONS.md`. Product questions go to the founders.
