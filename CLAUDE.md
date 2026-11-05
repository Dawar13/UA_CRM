# UA Internal CRM

Project context for Claude Code. Read this whole file at the start of every session. The active phase brief lives in `docs/phases/`. Progress lives in `docs/PROGRESS.md`.

---

## 1. What we are building

An internal CRM for **Utopian Autonomy (UA)**, an AI-native operating system for manufacturing plants. It tracks every relationship the company depends on: customers (plants), investors, advisors, connectors who open doors, and service providers such as CAs, lawyers and incorporation or visa agents.

It looks and feels like a spreadsheet, but calmer and faster. People type rows, see every person's warmth and stage at a glance, open a row to see where the deal stands, and never lose track of a follow-up.

**Users:** the UA founding team. Today that is Dawar and Dhruv. More members can be added.

**Three qualities, in this order when they conflict:**
1. **Ease of use.** Fewer clicks, keyboard first, nothing to learn.
2. **Functionality and utility.** It does the CRM job completely and reliably.
3. **Beauty.** White, calm, sleek, with the UA blue used with intent.

None of the three is optional. A screen that works but looks rough is not done, and neither is a beautiful screen that takes four clicks.

**Hard constraints:**
- **₹0 running cost.** Free tiers and open-source libraries only, with permissive or OSI licences (MIT, Apache-2.0, BSD, ISC, MPL-2.0, OFL). Check the licence before adding any dependency and log it in `docs/DECISIONS.md`.
- **No AI or LLM APIs.** All parsing (quick-add, PDFs, OCR, field mapping) is deterministic code and open-source models running in the browser.
- **Real contact data never goes into git.** Fixtures and seed data are invented. Imports of real files happen at runtime from `data/import/`, which is gitignored.

---

## 2. Product model

### 2.1 Layout

```
+--[3px soft gradient strip]-----------------------------------------------+
| [UA] Utopian Autonomy  Internal CRM | Today  Dawar  Dhruv  +  | Ctrl K  ... |
+--------------------------------------------------------------------------+
| Customers  Investors  Advisors  Connectors  Service providers  + Sheet   |
+--------------------------------------------------------------------------+
| > quick add (Phase 1)                                                     |
+---------------------------------------------------------+----------------+
| Name | Warmth | Stage (dots) | Tags | Last touch | Next  | This week      |
| ...grid rows...                                         | (calendar      |
| [expanded row: stage tracker, next action, history]     |  panel)        |
+---------------------------------------------------------+----------------+
```

- **Member tabs** are at the top level, and one member tab is on screen at a time, full width. The **Today** tab shows the day of whoever is signed in.
- **Sheets** sit inside a member tab. Each member creates and owns their own sheets. When a sheet is created, it starts from a template or from blank.
- **One database underneath.** All members' sheets live in one database, so search and the duplicate check work across every tab. On screen, tabs stay separate.

### 2.2 Core concepts

| Concept       | Meaning                                   | Rules                                                                                                                                 |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Member        | A UA team member                          | Has a name, an email, and their own sheets and calendar                                                                               |
| Sheet         | A category of contacts, such as Customers | Owned by one member; has its own columns and its own stages, or none                                                                  |
| Row           | One person                                | Belongs to one sheet. Core fields are fixed; custom fields are per sheet                                                              |
| Column        | A field on a sheet                        | Typed. Can be added, renamed, reordered, hidden and resized. System columns can be hidden but not deleted                             |
| Warmth        | How engaged the person is right now       | Exactly one of Warm (green), Waiting (amber, ball in their court), Cold (red), or empty. Set by hand, never automatic                 |
| Stage         | How far the relationship has progressed   | An ordered list per sheet; the last stage is the win (Paid, Committed, Done). The date each stage is reached is stamped automatically |
| Lost          | The relationship is closed                | A separate flag that records the stage it stopped at and the date. Reopen clears it. Cold is not Lost: cold can be revived            |
| Tag           | A label that cuts across sheets           | Many per row. One shared tag library across all sheets and members. Each tag has a colour, auto-assigned and editable                 |
| History       | Dated log of every touch                  | Kinds: note, call, meeting, WhatsApp, email, stage change, warmth change, created, imported. Sources: manual, calendar, system        |
| Last touch    | Most recent history date                  | Always derived, never typed                                                                                                           |
| Next action   | The one forward-looking task              | Text plus date (fuzzy dates allowed). It drives the Today view and calendar events                                                    |
| Connects to   | Who this person can open doors to         | Links to other rows, plus free text for companies not yet in the CRM                                                                  |
| Introduced by | Who brought this person to UA             | Links to another row                                                                                                                  |

**Tag or column?** If every row needs a value, or the values come from a fixed list, make it a dropdown column. Tags are for things that cut across sheets: foundry, defence, pilot candidate, decision maker, IIT Bombay alumni, EF network, intro pending.

### 2.3 Core columns (every sheet)

Name, Company, Title, Phone, Email, LinkedIn, Links, Warmth, Stage (only if the sheet has stages), Tags, Last touch (derived), Next action, Next date, Introduced by, Connects to, Notes, Files.

### 2.4 Sheet templates

| Template             | Extra columns                                                                                                                                                                                                                                                  | Stages (last = win)                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Customers            | Plant location, Archetype (dropdown of the 15 archetypes below), Turnover band, Role in deal (Decision maker, Champion, User, Blocker), Pain, Wedge agent (Maintenance, Quality, Production, Procurement, Quote, Energy, Compliance), Ticket estimate (₹ L/yr) | Identified, Intro asked, First call, Plant visit, Pilot scoped, Pilot live, Paid |
| Investors            | Investor type (Angel, VC, CVC, Family office), Cheque size, Stage focus, Thesis fit                                                                                                                                                                            | Researching, Intro asked, First meeting, Diligence, Term sheet, Committed        |
| Advisors and experts | Expertise, What we want from them, Arrangement (Informal, Advisory equity)                                                                                                                                                                                     | Identified, Approached, Active                                                   |
| Connectors           | Relationship (Friend, Alumni, Family, Professional), Intro asked for, Intro made                                                                                                                                                                               | none                                                                             |
| Service providers    | Service (CA, Lawyer, Incorporation, Visa, Trademark, Other), Quote, Docs shared, Deadline                                                                                                                                                                      | Shortlisted, Engaged, Done                                                       |
| Blank                | none                                                                                                                                                                                                                                                           | none (stages optional)                                                           |

**Customer archetypes** (from the UA archetypes and ROI map): Auto and EV component makers; Precision job shops; Foundries and forging shops; Steel and metals processing; Electronics manufacturing; Consumer durables and appliances; Plastics, rubber and packaging; Specialty and batch chemicals; Pharma; Paints, coatings and adhesives; FMCG and food and beverage; Oil and gas, refining and petrochemicals; Cement and building materials; Hardware OEMs with supplier networks; Industrial distributors, MRO and defence suppliers.

**Column types:** text, long text, number, currency (₹, en-IN grouping, lakh and crore display), date (fuzzy allowed), dropdown, multi-select, person link (to another row), URL, phone, email, checkbox, files. Warmth, stage and tags are special system types.

### 2.5 Fuzzy dates

Dates may be exact ("12 Nov") or fuzzy ("early Oct", "mid Oct", "late Oct", "Oct 2026"). Store them as `{ date: ISO date, precision: 'day' | 'early-month' | 'mid-month' | 'late-month' | 'month' }`.
- Early is the 5th, mid is the 15th and late is the 25th, for sorting only.
- Display them as written ("Mid Oct").
- Timezone is Asia/Kolkata. "Today" means today in IST.

### 2.6 Quick-add language (Phase 1)

Click the first cell of an empty row, or press `/`, and type:

```
Rohan Mehta / Plant Head @ Hosur Precision Forge, Hosur
why: 4 heading lines, unplanned downtime is his KPI
+91 98450 12345  rohan@hpf.in  linkedin.com/in/rohanmehta
via: Krithik  #warm #foundry  stage: first call
next: fri 4pm send ROI note
```

**Saving:** Enter shows a preview card with every parsed field, coloured by confidence. Enter again commits. Esc edits.

**Parsing rules:**
1. **First line:** `Name / Title @ Company, Location`. Only the name is required.
2. **Detected without a key:**
   - Phones: libphonenumber-js, default region IN, stored as E.164.
   - Emails.
   - URLs: `linkedin.com/in/...` goes to LinkedIn, `wa.me` to Phone, anything else to Links.
   - Dates: chrono-node with reference time now in IST, forward-dated, plus the fuzzy month parts in 2.5.
3. **`key: value`** fills a column. A value ends at the next `key:`, at a `#tag`, or at the end of the line. Keys are case-insensitive.
   - Aliases: `why`, `rel` → Notes, or a "Why relevant" column if the sheet has one. `via`, `intro` → Introduced by. `next` → Next action and Next date (the date is parsed from the start of the value and the rest is the action text). `stage`, `s` → Stage. `note`, `n` → Notes. `loc` → Plant location or Location. `title`, `co`, `company`, `phone`, `email` → the matching core fields.
   - Any key also matches a sheet column label by unambiguous prefix (`cheque:` fills "Cheque size"). An ambiguous key is flagged in the preview.
4. **Values are fuzzy-matched** for stages and dropdowns ("first call" matches "First call"). Introduced by and person links match existing rows across all sheets, and the preview shows the match.
5. **Tags:** `#warm`, `#waiting` and `#cold` set Warmth. Any other `#word` adds a tag; tags that don't exist yet are created on commit with an auto colour.
6. **Nothing is dropped.** Unrecognised text is appended to Notes.
7. **Several contacts in one paste:** a blank line separates them.
8. **Logging a touch:** on an existing selected row, `> called, wants pilot on line 3, quote by 15 nov` adds a dated history entry (today) and updates Next action and Next date.
9. **Pasted text** (an email signature or LinkedIn profile text) goes through the same parser.

### 2.7 Duplicate check (Phase 1)

The check runs on every new row and every import, across all sheets of all members.

| Level | Trigger                                                                                                     | Behaviour                            |
| ----- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Hard  | Same phone (E.164), same email (lowercased) or same LinkedIn slug                                           | Blocks commit until the user chooses |
| Soft  | Similar full name after normalisation (Jaro-Winkler ≥ 0.92), or same first name and same normalised company | Non-blocking banner                  |
| None  | Only one common word matches                                                                                | No alert                             |

- **Name normalisation:** lowercase; strip titles (Mr, Ms, Mrs, Dr, Cdr, Capt, Col, Prof, Shri, Smt, Er); collapse spaces; also compare with spaces removed ("Navaneetha Krishnan" equals "Navaneethakrishnan").
- **Choices:**
  - **Merge:** the new values fill empty fields only; conflicts are shown side by side.
  - **Keep both, linked:** each row shows "Also in Dhruv's Connectors" with a jump link, and both rows show each other's history.
  - **Different person:** saves the row and remembers the pair as not-duplicate.

### 2.8 Search

Ctrl/Cmd+K opens a command palette that searches across every member and sheet: name, company, title, email, phone, tags, notes, connects to. Each result shows "Member · Sheet". Enter jumps to the row and expands it. The palette also lists commands (switch member, switch sheet, toggle theme, new row) with their shortcuts.

### 2.9 Today view (Phase 1, extended in Phase 2)

For the signed-in member, with each section collapsible:
- Overdue next actions.
- Due today.
- Today's meetings (Phase 2).
- Stale relationships: Warm or Waiting with no touch for 14 days (Phase 2).
- Added this week.

### 2.10 Calendar (Phase 2)

- **Connecting:** each member connects their own Google Calendar through OAuth. The scope is `calendar.events`.
- **Google app setup:** set the Google Cloud app to "In production" without verification. This avoids the 7-day refresh-token expiry of Testing mode. Members see Google's unverified-app screen once, and the app is limited to 100 users. Refresh tokens are stored server-side only (Supabase table readable only by the service role); token exchange and refresh run in Vercel functions.
- **Sync window:** sync starts on **5 Nov 2026**. Nothing earlier is imported. The panel shows the next 30 days, refreshed on open and every 15 minutes while the app is open.
- **Matching events to contacts:** attendee email first, then the contact's name or company in the event title. A matched upcoming event shows as a chip on the row. After it ends, a meeting history entry is added automatically.
- **Creating events:** "Add to calendar" on a next action creates the event in the member's calendar. Adding the contact as a guest is off by default.

### 2.11 Import and export (Phase 1)

- **Export:** every sheet has Export with Excel (.xlsx with warmth and tag colours) and PDF (A4 landscape). The export is the current view: visible columns, filters and sort. Settings has "Export everything": one .xlsx with a tab per sheet.
- **Import:** .xlsx and .csv through a mapping preview. A one-time importer handles the founders' existing sheet. It has Dawar, Dhruv and Common blocks with the columns Name, Company, Type, Spl mentions, Date. Type maps to the sheet (VC and Angel to Investors, Advisor to Advisors, Friend to Connectors with Relationship Friend, Industry chosen in the preview), Spl mentions to Connects to, and Date to an imported history entry (fuzzy). The founder chooses the owner for rows in the Common block.

### 2.12 PDF and photo import (Phase 2)

Everything runs in the browser, in a Web Worker.
1. **Digital PDFs:** pdfjs-dist reads the text layer. Layout cues from font sizes give the name (largest text on page 1) and title (the next line). There is a dedicated template for LinkedIn "Save to PDF" exports.
2. **Scans and photos:** `@paddleocr/paddleocr-js` (PP-OCRv5 mobile, ONNX Runtime Web). The fallback is tesseract.js.
3. **Mapping fields:** the same extractors as quick-add. Company names already in the CRM are matched first.
4. **Preview before saving.** Dropping a file on a sheet creates a new row. Dropping it on a row fills empty fields only, and any other change is shown as a diff first.
5. **Known risk:** threaded WASM needs COOP/COEP headers, which can break OAuth popups. Use redirect-based OAuth everywhere, and scope the COOP/COEP headers (or `credentialless`) so sign-in still works.

### 2.13 Trash and backup

- **Trash:** deleting rows or sheets is soft. They go to Trash for 30 days. Every destructive action shows an undo toast for 8 seconds.
- **Nightly backup (Phase 1):** a GitHub Actions job dumps the Supabase database every night into a private GitHub repository.

---

## 3. Experience rules

### 3.1 Ease of use (non-negotiable)

- **Keyboard first.** Every frequent action has a shortcut, shown in its tooltip and in the command palette. The `?` key opens the shortcut sheet.
- **No save buttons.** Every edit saves instantly (optimistic update) and can be undone.
- **No modals for routine edits.** Modals are only for confirmations, imports and multi-step flows.
- **Any contact is at most two clicks or one search away.** No full page reloads.
- **Never lose typed text.** Drafts in quick-add and in notes persist locally until committed.
- **Speed.** Interactions must feel instant (under 100 ms to visible response). The grid scrolls smoothly at 2,000 rows.
- **No dead buttons.** If a feature is not built yet, it is not on screen.

**Default shortcuts:**

| Shortcut                      | Action                                      |
| ----------------------------- | ------------------------------------------- |
| Ctrl/Cmd+K                    | Search and commands                         |
| `/`                           | Quick add                                   |
| `N`                           | New row                                     |
| Arrows, Home, End, PgUp, PgDn | Move in the grid                            |
| Enter                         | Expand the row, or edit the cell in Phase 1 |
| Esc                           | Collapse, or cancel                         |
| `W`                           | Cycle warmth on the active row              |
| `]` and `[`                   | Next and previous stage                     |
| Ctrl/Cmd+Z                    | Undo                                        |
| Ctrl/Cmd+.                    | Toggle the right panel                      |
| `?`                           | Shortcut sheet                              |

### 3.2 Visual identity

**White is the dominant colour.** The UA blue is for action, selection and progress. Other colours appear only where they carry meaning: warmth, stage outcome, tags.

**Brand colours.** These were sampled from the founder's reference images. The ramp is built in OKLCH at hue ~240.

| Token         | Hex     | Use                                                                                                                    |
| ------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `--brand-50`  | #EBF9FF | Selected row tint, subtle highlights                                                                                   |
| `--brand-100` | #D3F2FF | Hover tint on brand elements                                                                                           |
| `--brand-200` | #AAE3FF | Current-stage ring (light)                                                                                             |
| `--brand-300` | #7ECEFF |                                                                                                                        |
| `--brand-400` | #46B5F9 | Focus ring; links and progress in dark mode                                                                            |
| `--brand-500` | #1CA6EF | The sampled vivid UA blue. Brand mark, gradient strip, large decorative fills only (2.7:1 on white, so never for text) |
| `--brand-600` | #007BC1 | Primary button fill with white text (4.56:1); done-stage dots in light mode                                            |
| `--brand-700` | #006AA8 | Link and accent text on white (5.8:1)                                                                                  |
| `--brand-800` | #005387 | Current-stage ring (dark)                                                                                              |
| `--brand-900` | #003C68 |                                                                                                                        |

**Soft gradient** (sampled): `linear-gradient(90deg, #6CAAFD 0%, #B5DBFF 50%, #70BEFF 100%)`. Use it only for the 3px strip at the very top of the app, the sign-in screen background and empty-state art. Never behind text or data.

**Neutrals:**

| Token              | Light                                 | Dark    |
| ------------------ | ------------------------------------- | ------- |
| `--bg`             | #FFFFFF                               | #071117 |
| `--surface-subtle` | #F8FAFD                               | #0F1A21 |
| `--surface-raised` | #FFFFFF                               | #17232C |
| `--border`         | #E0E5E9                               | #27353E |
| `--border-strong`  | #8A9399 (≥3:1, for hollow stage dots) | #5E6A72 |
| `--text`           | #141C21                               | #E5ECF1 |
| `--text-secondary` | #565F65                               | #A6AFB7 |
| `--text-muted`     | #6B737A                               | #8C969E |

**Semantic colours:**

| Meaning                           | Light fg / bg        | Dark fg / bg      |
| --------------------------------- | -------------------- | ----------------- |
| Warm                              | #15803D / #DCFCE7    | #86EFAC / #0F2A1B |
| Waiting                           | #854D0E / #FEF3C7    | #FCD34D / #2B2108 |
| Cold                              | #B91C1C / #FEE2E2    | #FCA5A5 / #2E1111 |
| Won stage (Paid, Committed, Done) | #16A34A dot          | #4ADE80 dot       |
| Lost                              | #DC2626 dot and text | #F87171           |

**Stage dots:**
- Done stages are filled (`--brand-600` light, `--brand-400` dark).
- The current stage is filled with a 3px ring (`--brand-200` light, `--brand-800` dark).
- Future stages are hollow, with a 1.5px `--border-strong` outline.
- Lost is a filled red dot placed at the next stage position.
- State is conveyed by shape as well as colour.

**Tag palette:** a coloured 6px dot inside a neutral pill. The 8 hues are indigo #6366F1, violet #8B5CF6, pink #EC4899, orange #F97316, amber #F59E0B, lime #65A30D, teal #14B8A6, slate #64748B. New tags take the least-used hue.

**Contrast is tested, not assumed.** Body and label text must be ≥ 4.5:1. Meaningful graphics (dots, focus rings, chip borders) must be ≥ 3:1. This applies in both themes and is enforced by a unit test over the token file. If a hex above fails, adjust the hex, keep the intent, and log the change.

### 3.3 Typography, spacing, motion

- **Fonts:** Geist Variable for the UI and Geist Mono Variable for the quick-add input and code-like values. Both are self-hosted through Fontsource. Number cells use `font-variant-numeric: tabular-nums`.
- **Type scale:** 12 / 13 / **14 (base)** / 16 / 20 / 24 px. Weights 400, 500 and 600. Headings at 600 with letter-spacing -0.01em. Line height 1.45 for UI and 1.6 for long text.
- **Spacing:** a 4px grid. Grid rows are 40px (comfortable, the default) or 32px (compact, Phase 1 toggle). The header is 52px and the sheet bar 40px.
- **Corners:** 6px for controls, 10px for cards and popovers, full rounding for chips.
- **Surfaces:** 1px hairline borders and no heavy shadows. Popovers and menus get one soft shadow.
- **Motion:** 120 to 180 ms, ease-out. Row expansion animates height. `prefers-reduced-motion` disables non-essential motion.
- **Focus:** a visible 2px `--brand-400` ring with a 2px offset on every focusable element.

### 3.4 Branding in the header

From left to right:
- **Brand mark:** a 28px rounded square (radius 8) filled with `--brand-500`, with a white "UA" monogram in Geist 600.
- **Wordmark:** "Utopian Autonomy", 15px, weight 600, `--text`.
- **Label:** an "Internal CRM" pill, 12px, `--brand-700` on `--brand-50`.

The browser tab title is "UA · Internal CRM", and the favicon is the brand mark. If the founders later supply a logo, replace `src/assets/brand/` only.

### 3.5 Copy rules

- **Spelling and case:** British and Indian spelling (colour, organise). Sentence case everywhere. No exclamation marks. No "please", "successfully" or "simply".
- **Dates:** "5 Nov 2026"; "Thu 5 Nov" when the year is current. Times like "4:00 pm", always IST.
- **Money:** en-IN grouping, "₹25 L", "₹1.2 Cr".
- **Empty states invite action.** For example, "Add your first customer. Press / to quick add." Never "Nothing here".

### 3.6 Responsiveness and accessibility

- **Screen sizes:** desktop first. 1280px and wider is primary; 1024px must not break. Phone layout is backlog.
- **Accessibility:** WCAG 2.2 AA. The grid uses `role="grid"` semantics with `aria-rowcount` and `aria-colindex`. Toasts go through a live region. Everything works by keyboard alone.

---

## 4. Tech stack

Versions are the latest stable on npm as of 5 Nov 2026. Several are new majors, so **read the current docs and migration guides for each one before using it, and do not rely on memory of older APIs**. This matters most for TanStack Table v9, TypeScript 7, Vite 8, Vitest 5, React Router 8 and Zod 4. If a tool is incompatible with a major (for example, TypeScript 7 with a plugin), pin the newest version that works and log it in `docs/DECISIONS.md`.

| Layer                   | Choice                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                 | Current Node LTS, pinned in `.nvmrc` and `engines`; pnpm                                                                                                                     |
| App                     | React 19.3, Vite 8, TypeScript 7 (strict)                                                                                                                                    |
| Routing                 | React Router 8                                                                                                                                                               |
| Styling                 | Tailwind CSS 4.3 (CSS-first `@theme`, tokens as CSS variables), class-variance-authority, clsx, tailwind-merge                                                               |
| Primitives              | Radix UI (`radix-ui` unified package) for tabs, menus, popovers, tooltips and dialogs; cmdk for the palette; sonner for toasts; lucide-react for icons; motion for animation |
| Grid                    | TanStack Table 9 + TanStack Virtual 3, rendered as DOM (not canvas) so custom cells look right and tests can see them; own keyboard layer                                    |
| State                   | TanStack Query 5 (data), Zustand 5 (UI state)                                                                                                                                |
| Validation              | Zod 4                                                                                                                                                                        |
| Local data              | Dexie 4 (IndexedDB), used in Phase 0, in tests, and as an offline cache later                                                                                                |
| Backend (Phase 1)       | Supabase free tier: Postgres, Google sign-in restricted to an email allowlist, row-level security, Realtime, Storage; supabase-js 2                                          |
| Hosting (Phase 1)       | Vercel: static build plus `api/` serverless functions                                                                                                                        |
| Parsing (Phase 1 and 2) | chrono-node 2, libphonenumber-js, date-fns 4, pdfjs-dist 6, `@paddleocr/paddleocr-js` 0.4 (pre-1.0, so expect API changes), tesseract.js 7                                   |
| Export (Phase 1)        | ExcelJS 4, jsPDF 4 + jspdf-autotable 5                                                                                                                                       |
| Quality                 | Biome 2.6 (lint and format), Vitest 5 + Testing Library 16 + fake-indexeddb, Playwright 1.64 + @axe-core/playwright, GitHub Actions                                          |

**Banned:**
- Handsontable (its free licence is non-commercial).
- Canvas-rendered grids.
- Any paid API, any LLM or AI API.
- Third-party analytics or trackers.
- Google Fonts CDN (self-host instead).

---

## 5. Architecture

```
ua-crm/
  CLAUDE.md
  README.md
  docs/
    phases/PHASE_0.md            active phase brief (PHASE_1 and PHASE_2 written after each review)
    PROGRESS.md                  log per milestone: done, how to try it, known issues, next
    DECISIONS.md                 dated technical decisions and licences
    BACKLOG.md                   ideas and feedback not yet scheduled
    screenshots/                 light and dark captures per milestone
  src/
    app/                         App.tsx, router, providers, layout shell, error boundary
    components/ui/               primitives: Button, IconButton, Input, Textarea, Kbd, Tabs, Menu,
                                 Popover, Tooltip, Dialog, Toast, Skeleton, EmptyState, Pill, Separator
    components/crm/              BrandLockup, MemberTabs, SheetTabs, WarmthChip, TagChip, StageDots,
                                 StageTracker, DateText, AvatarInitials, ThemeToggle
    features/
      grid/                      SheetGrid, cells/, keyboard/, column defs from sheet schema
      row-detail/                expanded row: tracker, next action, history
      calendar-panel/            right panel
      command-palette/
      quick-add/                 Phase 1
      dedupe/                    Phase 1
      today/                     Phase 1
      import-export/             Phase 1
      file-import/               Phase 2 (pdf, ocr workers)
      design/                    /design showcase route
    domain/                      types, zod schemas, templates, stages, warmth, tags, fuzzy dates,
                                 identity normalisers, formatters (pure functions, no React)
    data/
      repository.ts              Repository interface (the only way UI touches data)
      local/                     Dexie db, LocalRepository, seed
      supabase/                  Phase 1: SupabaseRepository
      hooks/                     TanStack Query hooks over the repository
    lib/                         cn, keyboard helpers, env
    styles/                      tokens.css, globals.css
    assets/brand/
  tests/
    e2e/  a11y/  visual/  perf/  fixtures/
  api/                           Phase 1 and 2 Vercel functions
  supabase/migrations/           Phase 1
  scripts/                       one-off importers, backup helpers
  data/import/                   gitignored, real files for import
  .github/workflows/ci.yml
```

**Rules:**
- **The Repository is the only door to data.** Components never import Dexie or Supabase directly; they call hooks, and the hooks call the Repository.
- **`domain/` is pure TypeScript** with no React and no I/O, and has the highest test coverage.
- **Stage, warmth and history changes are one operation.** Changing a stage stamps the stage date and appends a history entry together, and the same applies to warmth.
- **Store UTC, display IST.** Fuzzy dates keep their precision end to end.

---

## 6. Testing and Definition of Done

**Test layers:**

| Layer             | Tool                          | What it covers                                                                                                                                         |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit              | Vitest                        | All of `domain/`, formatters, parsers, the dedupe scorer, repository behaviour on fake-indexeddb, token contrast                                       |
| Component         | Vitest + Testing Library      | Every CRM component's states, keyboard behaviour and ARIA                                                                                              |
| End to end        | Playwright                    | Real user flows in the browser, with reload to prove persistence                                                                                       |
| Accessibility     | @axe-core/playwright          | Main screens and `/design`, light and dark: zero serious or critical violations                                                                        |
| Visual            | Playwright `toHaveScreenshot` | Main screens and `/design`, light and dark. Baselines are generated in the official Playwright Docker image so fonts render the same locally and in CI |
| Performance smoke | Playwright                    | 2,000-row sheet: first rows visible quickly, scroll to bottom works, no long tasks over 200 ms while scrolling                                         |

**Coverage:** `domain/` ≥ 90% lines; overall ≥ 70%.

**Definition of Done** for every story:
1. It works with keyboard and with mouse, and it has been checked in light and dark.
2. Tests are added at the right layers, and `pnpm test:all` is green.
3. No console errors or warnings in the browser.
4. The copy follows section 3.5, and the visuals follow sections 3.2 to 3.4.
5. `docs/PROGRESS.md` is updated; `docs/DECISIONS.md` too if a choice was made.
6. It is committed with a conventional commit message.

---

## 7. Working agreement (agile)

- **Work is split into phases, then milestones, then stories.** Every milestone ends in something that can be demoed.
- **Build vertical slices,** smallest useful thing first. Do not build a layer nobody can see yet.
- **At the end of each milestone:** run all tests, capture light and dark screenshots into `docs/screenshots/`, update `PROGRESS.md` with a "try this" script, and commit. Then continue.
- **At the end of each phase:** stop and report. The founders review a demo, and feedback goes into `BACKLOG.md`. The next phase brief is then written in light of that feedback.
- **Who decides what:** make technical decisions yourself and log them. Product decisions (what a user sees or must do) belong to the founders, so ask instead of guessing.
- **Tests and existing behaviour:** never weaken a test to make it pass. If a test is wrong, fix it and say why in the commit. Never delete working features to finish a story.

---

## 8. Phases

### Phase 0: Foundation and walking skeleton (no accounts needed)

Repository, toolchain, every dependency installed and smoke-tested, the design system with a `/design` showcase, the domain model, local data with seed, and the app shell. The shell has branding, member and sheet tabs, a beautiful read-only grid with custom cells, an expandable row with an interactive stage tracker and warmth, search over local data, a calendar panel with sample events, dark mode, full test harness and CI.

**Exit:** the founders can click through the real look and feel, on sample data, in light and dark, and every test layer is green in CI.

### Phase 1: Core CRM, live for both founders

Supabase (schema, RLS, Google sign-in with allowlist, Realtime) and the Supabase repository; Vercel deploy. Grid editing for every column type, add and delete rows (Trash and undo), the column manager, the sheet manager with templates and a stage editor, and adding members. History timeline, next action, tags library, WhatsApp, call and email buttons. Quick-add language with preview, smart paste and the duplicate check. Search across everything and the Today view. Import of the founders' existing sheet plus xlsx and csv; export to xlsx and PDF, plus export everything. Nightly backup.

**Exit:** both founders use it daily for a week and the old spreadsheet is retired.

### Phase 2: Connected and smart

Google Calendar connect per member (OAuth, production-unverified), with sync from 5 Nov 2026 onwards, a calendar panel per tab, matching events to contacts, automatic meeting history, and creating events from next actions. PDF import (text layer with layout cues, LinkedIn PDF template) and photo or scanned import (PaddleOCR in the browser, Tesseract fallback), with preview and fill-empty-only on rows. Stale-relationship nudges in Today. A performance and polish pass.

**Exit:** a visiting card photo or a LinkedIn PDF becomes a correct row with one confirmation, and every meeting with a contact appears in their history without typing.

### Backlog (after Phase 2)

Board view (kanban by stage), grouping customers by company, phone quick-add as an installable web app, daily email digest of follow-ups, change history (who edited what).
