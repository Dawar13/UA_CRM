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
+--------------------------------------------------------------------------+
| [UA] Utopian Autonomy  INTERNAL CRM | Today (Dawar) Dhruv | Search Ctrl K  ... |
+---------------------------------------------------------+----------------+
| /01 Customers 12\ /02 Investors 6\ /03 …\   (folder tabs)| THIS WEEK      |
| +-------------------------------------------------------+| 7-day strip    |
| | 01 — CUSTOMERS            folder front (blue → white)  || last 30 days   |
| | People · Open pipeline    | Pipeline: pixel stacks     || (dot field)    |
| | Won    · Due              |                            ||                |
| +-------------------------------------------------------+| agenda cards   |
| | > quick add (own tab only)                             ||                |
| | Name | Warmth | Stage (bar) | Tags | Last touch | Next  ||                |
| | ...grid rows...  [expanded row: tracker, history]      ||                |
+---------------------------------------------------------+----------------+
```

Each sheet is a **folder**: its tab rises from a row of folder tabs and joins the folder front, a summary of the sheet (figures and the pipeline) that fades from the folder's blue into the white sheet below. Clicking the active tab folds the front away to one line.

- **Member tabs** are at the top level, and one member tab is on screen at a time, full width. The **Today** item, first in the member control, shows the day of whoever is signed in.
- **Your tab and theirs.** You edit only your own tab. Another member's tab is view only: no editing controls, a quiet "Dhruv's tab, view only" note on the folder front, and every reading action still works (§2.14).
- **Sheets** sit inside a member tab. Each member creates and owns their own sheets. When a sheet is created, it starts from a template or from blank.
- **One database underneath.** All members' sheets live in one database, so search and the duplicate check work across every tab. On screen, tabs stay separate.

### 2.2 Core concepts

| Concept       | Meaning                                   | Rules                                                                                                                                 |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Member        | A UA team member                          | Has a name, an email, and their own tab of sheets and calendar. An admin or a regular member; active or deactivated (§2.14)           |
| Sheet         | A category of contacts, such as Customers | Owned by one member; has its own columns and its own stages, or none                                                                  |
| Row           | One person                                | Belongs to one sheet. Core fields are fixed; custom fields are per sheet                                                              |
| Column        | A field on a sheet                        | Typed. Can be added, renamed, reordered, hidden and resized. System columns can be hidden but not deleted                             |
| Warmth        | How engaged the person is right now       | Exactly one of Warm (olive green), Waiting (ochre, ball in their court), Cold (brick), or empty. Set by hand, never automatic         |
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

| Template             | Extra columns                                                                                                                                                                                                                                                                                                                                | Stages (last = win)                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Customers            | Plant location, Archetype (dropdown of the 15 archetypes below), Turnover band (MSME: Micro < ₹10 Cr, Small ₹10–100 Cr, Medium ₹100–500 Cr, Large > ₹500 Cr), Role in deal (Decision maker, Champion, User, Blocker), Pain, Wedge agent (Maintenance, Quality, Production, Procurement, Quote, Energy, Compliance), Ticket estimate (₹ L/yr) | Identified, Intro asked, First call, Plant visit, Pilot scoped, Pilot live, Paid |
| Investors            | Investor type (Angel, VC, CVC, Family office), Cheque size, Stage focus, Thesis fit                                                                                                                                                                                                                                                          | Researching, Intro asked, First meeting, Diligence, Term sheet, Committed        |
| Advisors and experts | Expertise, What we want from them, Arrangement (Informal, Advisory equity)                                                                                                                                                                                                                                                                   | Identified, Approached, Active                                                   |
| Connectors           | Relationship (Friend, Alumni, Family, Professional), Intro asked for, Intro made                                                                                                                                                                                                                                                             | none                                                                             |
| Service providers    | Service (CA, Lawyer, Incorporation, Visa, Trademark, Other), Quote, Docs shared, Deadline                                                                                                                                                                                                                                                    | Shortlisted, Engaged, Done                                                       |
| Blank                | none                                                                                                                                                                                                                                                                                                                                         | none (stages optional)                                                           |

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

- **Connecting:** each member connects their own Google Calendar through its own OAuth (sign-in stays email and password), from the side panel or the ⋯ menu. Scopes `openid email calendar.events.owned` (switchable to `calendar.events` by setting). Disconnect is in the ⋯ menu.
- **Google app setup:** set the Google Cloud app to "In production" without verification. This avoids the 7-day refresh-token expiry of Testing mode. Members see Google's unverified-app screen once, and the app is limited to 100 users. Refresh tokens are sealed (AES-256-GCM, versioned key) in a Supabase table no client role can read; token exchange, refresh and every Google call run in Vercel functions (`api/`). Setup steps: `docs/RUNBOOK.md` §7.
- **Sync window:** sync starts on **5 Nov 2026**. Nothing earlier is imported. The server keeps a window up to 60 days ahead, synced on open (if over 5 minutes old), every 15 minutes while the app is open, on Sync now, on Google push notifications (live), and by a daily job.
- **Sharing (D-054):** calendars are shared, view only, like sheets. In another member's tab the panel shows their week ("Dhruv's calendar, view only"), without Sync now, connect or suggestions; before they connect it says "Dhruv has not connected Google Calendar". Policies let every member read every member's events, connection status and links; only the server writes events and connections, and only the owner writes their links. Tokens stay unreadable to every client.
- **Matching events to contacts:** attendee email first; when none matches, a title naming one of your own contacts suggests "Rohan Mehta?" with yes or no. A matched meeting in the next week shows as a mark beside the name in the grid and as Next meeting in the expanded row. After it ends, a Meeting history entry is added automatically, to your own rows only.
- **Creating events:** "Add to calendar" on a next action with an exact day creates the event in the member's calendar (all day, or a time for 30 minutes). Adding the contact as a guest is off by default. CRM edits update or remove the event; a move in Google updates the next action with a note; a deletion in Google offers Add again.
- **The calendar page** (`/calendar`, the Calendar item after Today, set apart from the member tabs by a hairline): "Dawar's calendar", a week like Google Calendar's week view, with contacts on events. A switch beside the title opens another member's week, view only (`/calendar?member=dhruv`). It reads and links; changing events stays in Google Calendar.

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

- **Trash:** deleting rows, columns or sheets is soft. They go to their owner's Trash for 30 days; nobody else sees another member's Trash. Every destructive action shows an undo toast for 8 seconds.
- **Nightly backup (Phase 1):** a GitHub Actions job dumps the Supabase database every night into a private GitHub repository.

### 2.14 Ownership (Phase 1)

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

- **Tags** are one shared vocabulary. Any member can create a tag and apply it to their own rows. Only the creator can rename, recolour or delete a tag, and only while no other member's rows use it; otherwise the action is refused with a message naming whose rows use it.
- **Members.** A member is an admin or a regular member; both founders start as admins. Admins can add a member (name and email; their login is created in the Supabase dashboard), deactivate and reactivate. Admins get no extra rights over anyone's data. A deactivated member cannot sign in; their tab stays visible to everyone, marked inactive and view only. Transferring sheet ownership is in the backlog.
- **Calendar (Phase 2):** every member can see every calendar (D-054); a calendar writes history only into its owner's rows. An event that matches a row in someone else's tab is shown as a read-only hint, and nothing is written.
- **View only, in behaviour.** In another member's tab no editing controls exist (no quick-add, no add row, no edit items in column or sheet menus, no responsive stage or warmth controls). The tab says so quietly and always ("Dhruv's tab, view only"). Edit keystrokes (typing into a cell, Enter to edit, Delete, paste, `W`, `]`, `[`) do nothing; the first attempt in a session shows one short toast ("Dhruv's sheets are view only"), later ones are silent. Every reading action keeps working: expand, search, copy, contact buttons, export, follow links. "Copy to my sheet" is available on any row: it asks which of your sheets, runs the duplicate check and creates a linked row in your tab. Other members' changes appear live without moving your focus or scroll.
- **Enforced three times.** Every write path has a UI check through `can(member, action, target)` in `domain/`, a database policy, and a test proving another member is refused.

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

| Shortcut                      | Action                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| Ctrl/Cmd+K                    | Search and commands                                        |
| `/`                           | Quick add                                                  |
| `N`                           | New row                                                    |
| Arrows, Home, End, PgUp, PgDn | Move in the grid (Ctrl/Cmd+Home and End: first, last row)  |
| Enter, F2                     | Edit the cell; on Name, Enter expands or collapses the row |
| Any other character           | Starts editing the cell with that character                |
| Tab                           | Save and move right while editing                          |
| Esc                           | Cancel the edit, collapse, or clear the selection          |
| Shift+Up and Down             | Select several rows                                        |
| Delete; Ctrl/Cmd+Delete       | Clear the cell or trash the selected rows; trash the row   |
| Ctrl/Cmd+C and V              | Copy, or paste from Excel or Google Sheets                 |
| Right-click, or the menu key  | Format the cell: fill colour, wrap text, row height        |
| `W`                           | Cycle warmth on the active row                             |
| `]` and `[`                   | Next and previous stage                                    |
| Ctrl/Cmd+Z; Ctrl/Cmd+Shift+Z  | Undo; redo                                                 |
| Ctrl/Cmd+.                    | Toggle the right panel                                     |
| `?`                           | Shortcut sheet                                             |

`W`, `N`, `[`, `]`, `/` and `?` are shortcuts, never typed into a cell; to start a cell with one of them, press Enter or F2 first.

The same fill, wrap and height are on the format bar at the right of the quick-add line (your own tab).

### 3.2 Visual identity

**The code is the design source of truth.** The current app (`src/`, tokens and the `/design` page) defines how things look. New surfaces are built from the components and tokens that exist, placed where the current design puts that kind of thing, and added to `/design` with visual tests. If a document describes visuals that differ from the code, the code wins and the document is updated.

The founders approved this look in M0.6 (5 Nov 2026). It is calm and art-like: paper white, one blue palette for structure and progress, and an earthy "field" palette for warmth and activity. Colours carry meaning; soft gradients and joined shapes replace pills and dots. The full system is in `src/styles/tokens.ts` and on the `/design` page.

**Paper and ink.** White is the dominant colour. Surfaces are paper white with a mist side panel, hairline borders and soft shadows only on floating cards.

| Token              | Light   | Dark    |
| ------------------ | ------- | ------- |
| `--bg`             | #FFFFFF | #0A1116 |
| `--surface-subtle` | #F7F9FB | #0C151B |
| `--surface-raised` | #FFFFFF | #0E181F |
| `--border`         | #E4E9ED | #1C2932 |
| `--border-strong`  | #858E94 | #66737B |
| `--text`           | #0E1A22 | #E6EDF1 |
| `--text-secondary` | #4A5761 | #A9B5BD |
| `--text-muted`     | #646F78 | #87949D |
| `--link`           | #0B6AA6 | #7CC8F5 |

**The blue palette** (from the founders' reference), navy to white: #03045E, #033E8A, #0078B7, #0096C8, #00B4D7, #48CAE4, #91E0EF, #AEE8F4, #CAF1F8, #FFFFFF. It is used for:
- **Folders.** Each sheet's tab is a two-stop gradient, deepest first: 01 #0096C8 → #00B4D7, 02 #00B4D7 → #48CAE4, 03 #48CAE4 → #91E0EF, 04 #91E0EF → #AEE8F4, 05 #AEE8F4 → #CAF1F8 (sheet n takes folder n mod 5). The folder front fades from its colour to paper. Ink text. In dark mode the tabs run #0078B7 down to #03045E with white text.
- **Stages.** Open stages step from light (early) to deep (far along): #CAF1F8, #91E0EF, #48CAE4, #00B4D7, #0096C8, #0078B7.
- **The pixel pipeline** (folder front, D-053): a stack of small squares per stage, one per person who reached it, on a faint dot matrix. At the bottom, who is there now in their warmth colour (deeper when touched more recently); above, those who went further in the stage's blue, #91E0EF → #033E8A along the stages (reversed in dark mode); charcoal for those lost there. Conversion chips sit on a sand baseline. On big sheets a square stands for several people, and the caption says how many.
- **Primary buttons:** #0078B7 with white text. The focus ring is #0078B7 (light) and #48CAE4 (dark).
- **Today markers:** a sky gradient (#48CAE4 → #00B4D7 with ink text). The brand mark is the founders' logo (§3.4); the #6CC4F6 → #1C9BEA token remains for the open member and accents.

**The field palette** (from the founders' dot-chart reference): olive and sage greens, yellow ochre, orange and brick, with sand at zero and blue as the rare accent.

| Meaning                      | Light                                                 | Dark                         |
| ---------------------------- | ----------------------------------------------------- | ---------------------------- |
| Warm chip (text / soft fill) | #3D6A29 on #F1F7E8 → #E3EFD3, square #8CC36F          | #B9DDA3 on #293C2B → #213126 |
| Waiting chip                 | #77570F on #FCF5E0 → #F7E9C2, square #EBC155          | #EFD394 on #3C3824 → #2E2D20 |
| Cold chip                    | #963520 on #FBEAE3 → #F6D7CB, square #D9603D          | #F2B19B on #3C241F → #2F1F1D |
| Won stage                    | #6FB257 (label text #3D7A2A)                          | #7DBE62 (#A5D98A)            |
| Lost stage                   | #D9603D (text #A93A26); lost people are charcoal dots | #E06A4C (#F2A58E)            |
| Activity held (up)           | #D6E7C0 → #4F9C46, deeper as a day gets busier        | dim to bright                |
| Activity missed (down)       | #F1CD62 → #EC9C47 → #D9603D → #B23B2A                 | same                         |
| Stage moved / zero line      | #3A9AD9 / sand #EADFC2                                | #3A9AD9 / #4A4330            |

Warmth squares in the folder front have three shades each: deeper means the person was touched more recently (within 7 days, within 14, older).

**Stage bar:** in the grid, one joined bar (a cell per stage, 1px gaps, ends rounded) next to the stage name; reached cells take the ramp, the win is olive, unreached cells a pale track, skipped cells are hatched, and a lost row greys its reached cells and marks the next one brick. In the expanded row the same blocks are larger, with the name and date inside: stages passed are pencil hatching in their own ramp colour (so the shade deepens along the bar), the current stage is solid with a ring, and skipped stages are faint grey hatching (D-048).

**Tag palette:** a small coloured square beside the tag name, no pill. The 8 softened hues are indigo #7C83F2, violet #A28CF4, pink #EE8FB5, orange #F2A06E, amber #E9BC5C, lime #8DC46E, teal #4FC2B4, slate #8B98A9. New tags take the least-used hue.

**Gradients** are soft and purposeful: folder tabs and fronts, warmth and today chips, and the funnel. Never behind body text that would lose contrast. The old 3px strip at the top of the app is gone; the soft sampled gradient (#6CAAFD → #B5DBFF → #70BEFF) remains only for the sign-in background. Every empty state shows the same small heatmap (`HeatmapArt`): 7 × 4 rounded cells in quiet greys, the first column in stage blues with one deep-blue cell, popping in with a short ripple (skipped under reduced motion). The side panel's clear week labels its rows with hours (9, 12, 3, 6) and puts the deep-blue cell at the current part of today.

**Contrast is tested, not assumed.** Body and label text must be ≥ 4.5:1, including text on every folder colour, stage block and chip gradient stop. Focus rings and hollow outlines must be ≥ 3:1. Stage cells, warmth squares and activity dots are supplementary: each sits beside text that says the same thing, so they are not held to 3:1. This applies in both themes and is enforced by a unit test over the token file. If a hex above fails, adjust the hex, keep the intent, and log the change.

### 3.3 Typography, spacing, motion

- **Fonts:** Geist Variable for the UI and Geist Mono Variable for labels, dates, money, counts and the quick-add input. Both are self-hosted through Fontsource. Numbers use `font-variant-numeric: tabular-nums`.
- **Type scale:** 12 / 13 / **14 (base)** / 16 / 20 / 24 px for UI text; figures on the folder front are 40px (27px when long) at weight 400 with tight tracking. Section labels are Geist Mono, 10.5 to 11.5px, uppercase, letter-spacing 0.08 to 0.1em. Weights 400, 500 and 600 (550 for names). Line height 1.45 for UI and 1.6 for long text.
- **Spacing:** a 4px grid. The grid reads like a spreadsheet: single-line rows of 36px (comfortable) or 30px (compact, Phase 1 toggle), 13px cell text, visible gridlines between every row and column (`--grid-line`) and a shaded 32px header row (`--grid-header`). The header is 56px; the active folder tab is 40px and the others 31px.
- **Corners:** squarer than before: 4px for chips and badges, 6px for controls, 8px for the top of folder tabs, 10px for cards and popovers. Names stand alone: no initials or avatar tiles beside them (D-034).
- **Surfaces:** 1px hairline borders. Floating cards get one soft shadow; the pipeline card on the folder front is frosted glass.
- **Motion:** 120 to 180 ms, ease-out. Folder tabs rise when chosen; row expansion animates height. `prefers-reduced-motion` disables non-essential motion.
- **Focus:** a visible 2px focus ring with a 2px offset on every focusable element.

### 3.4 Branding in the header

From left to right:
- **Brand mark:** the founders' UA logo (a white U and striped A on grainy UA blue), a 28px rounded square (radius 7), from `src/assets/brand/ua-mark.png` (D-044).
- **Wordmark:** "Utopian Autonomy", 15px, weight 600, `--text`.
- **Label:** "INTERNAL CRM" in Geist Mono caps, 10.5px, link blue, with a light blue hairline (radius 4).
- **Members:** a segmented control; the open member is a raised white pill.

The browser tab title is "UA · Internal CRM", and the favicon is the same logo (`ua-favicon.png`, 64px). To change the logo, replace the files in `src/assets/brand/` only.

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

| Layer                   | Choice                                                                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                 | Current Node LTS, pinned in `.nvmrc` and `engines`; pnpm                                                                                                                                                                                                                |
| App                     | React 19.3, Vite 8, TypeScript 7 (strict)                                                                                                                                                                                                                               |
| Routing                 | React Router 8                                                                                                                                                                                                                                                          |
| Styling                 | Tailwind CSS 4.3 (CSS-first `@theme`, tokens as CSS variables), class-variance-authority, clsx, tailwind-merge                                                                                                                                                          |
| Primitives              | Radix UI (`radix-ui` unified package) for tabs, menus, popovers and dialogs; an in-house lightweight tooltip (D-024); cmdk for the palette; sonner for toasts; lucide-react for icons; motion for animation                                                             |
| Grid                    | TanStack Table 9 + TanStack Virtual 3, rendered as DOM (not canvas) so custom cells look right and tests can see them; own keyboard layer                                                                                                                               |
| State                   | TanStack Query 5 (data), Zustand 5 (UI state)                                                                                                                                                                                                                           |
| Validation              | Zod 4                                                                                                                                                                                                                                                                   |
| Local data              | Dexie 4 (IndexedDB), used in Phase 0, in tests, and as an offline cache later                                                                                                                                                                                           |
| Backend (Phase 1)       | Supabase free tier (one project, D-035): Postgres, email and password sign-in for listed members (Google joins with Calendar in Phase 2), row-level security, Realtime, Storage, `pg_trgm`; supabase-js 2; Supabase CLI for the local stack, migrations and pgTAP tests |
| Hosting (Phase 1)       | Vercel Hobby (D-032, D-046): builds from the repository on every push to `main` (`vercel.json`); production uses Supabase, previews run on sample data                                                                                                                  |
| Parsing (Phase 1 and 2) | chrono-node 2, libphonenumber-js, date-fns 4, pdfjs-dist 6, `@paddleocr/paddleocr-js` 0.4 (pre-1.0, so expect API changes), tesseract.js 7                                                                                                                              |
| Export (Phase 1)        | ExcelJS 4, jsPDF 4 + jspdf-autotable 5                                                                                                                                                                                                                                  |
| Quality                 | Biome 2.6 (lint and format), Vitest 5 + Testing Library 16 + fake-indexeddb, Playwright 1.64 + @axe-core/playwright, GitHub Actions                                                                                                                                     |

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
    phases/                      PHASE_0.md, PHASE_1.md (active) and PHASE_1_PLAN.md
    PROGRESS.md                  log per milestone: done, how to try it, known issues, next
    DECISIONS.md                 dated technical decisions and licences
    BACKLOG.md                   ideas and feedback not yet scheduled
    RUNBOOK.md                   Phase 1: backup and restore
    screenshots/                 light and dark captures per milestone
  src/
    app/                         App, routes, providers, shell (Header, SheetBar, MainView, RightPanel),
                                 UI store, global shortcuts, theme, error boundary
    auth/                        Phase 1: AuthProvider (Supabase email sign-in; local member picker)
    components/ui/               primitives: Button, IconButton, Input, Textarea, Kbd, Tabs, Menu,
                                 Popover, Tooltip (in-house), Dialog, Toast, Skeleton, EmptyState, Pill, Separator
    components/crm/              BrandLockup, MemberTabs, SheetTabs (folder tabs), WarmthChip,
                                 TagChip, StageDots (stage bar), StageTracker, DateText,
                                 ThemeToggle
    features/
      grid/                      SheetGrid (virtualised ARIA grid and keyboard layer), GridRow,
                                 cells, column model
      sheet-summary/             folder front: figures, pipeline card (pixel stacks)
      row-detail/                expanded row: tracker, warmth, next action, fields, history
      calendar-panel/            right panel: week strip, 30-day activity field, agenda
      calendar/                  Phase 2: Google Calendar states, the week page, next actions in the
                                 calendar, today's meetings, sync hooks
      command-palette/
      design/                    /design showcase route
      quick-add/  today/  trash/  import-export/   Phase 1
      sheets/  team/  tags/      Phase 1: sheet, column and stage dialogs; members; tag library
      file-import/               Phase 2 (pdf, ocr workers)
    domain/                      types, zod schemas, templates, stages, warmth, tags, fuzzy dates,
                                 identity normalisers, formatters, sheet summary, activity;
                                 Phase 1: permissions (can), quickadd/, dedupe/, cellInput,
                                 sheetEdits, today, importer/ (pure, no React)
    data/
      repository.ts              Repository interface (the only way UI touches data)
      local/                     Dexie db, LocalRepository, seed
      supabase/                  Phase 1: client, SupabaseRepository, mappers, errors, Realtime
      hooks/                     TanStack Query hooks over the repository
    lib/                         cn, keyboard helpers, storage, env, undo stack
    styles/                      tokens.ts → tokens.css, globals.css
    assets/brand/
  tests/
    unit/  component/  support/  e2e/  a11y/  visual/  perf/  fixtures/
    contract/  e2e-live/         Phase 1 (the Supabase contract run is the integration layer)
  api/                           Phase 2: Vercel functions for Google Calendar (_lib/ holds the server
                                 code: OAuth, sync, sealed tokens, the Supabase store)
  supabase/                      Phase 1: config, migrations/, tests/ (pgTAP)
  scripts/                       token generation, visual baselines; Phase 1: backup/ (dump,
                                 restore check, Storage mirror and restore)
  data/import/                   gitignored, real files for import
  .github/workflows/             ci.yml, visual-baselines.yml; Phase 1: backup.yml
  vercel.json                    Phase 1: Vercel build settings, SPA fallback and headers
  playwright.live.config.ts      Phase 1: the live browser tests against Supabase
```

**Rules:**
- **The Repository is the only door to data.** Components never import Dexie or Supabase directly; they call hooks, and the hooks call the Repository. Both implementations enforce ownership: the local one in code with the same `can()` the UI uses, the Supabase one through row-level security.
- **`domain/` is pure TypeScript** with no React and no I/O, and has the highest test coverage.
- **Stage, warmth and history changes are one operation.** Changing a stage stamps the stage date and appends a history entry together, and the same applies to warmth.
- **Store UTC, display IST.** Fuzzy dates keep their precision end to end.

---

## 6. Testing and Definition of Done

**Test layers:**

| Layer             | Tool                          | What it covers                                                                                                                                                  |
| ----------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | Vitest                        | All of `domain/`, formatters, parsers, the dedupe scorer, repository behaviour on fake-indexeddb, token contrast                                                |
| Component         | Vitest + Testing Library      | Every CRM component's states, keyboard behaviour and ARIA                                                                                                       |
| End to end        | Playwright                    | Real user flows in the browser, with reload to prove persistence                                                                                                |
| Accessibility     | @axe-core/playwright          | Main screens and `/design`, light and dark: zero serious or critical violations                                                                                 |
| Visual            | Playwright `toHaveScreenshot` | Main screens and `/design`, light and dark. Baselines are generated in the official Playwright Docker image so fonts render the same locally and in CI          |
| Performance smoke | Playwright                    | 2,000-row sheet: first rows visible quickly, scroll to bottom works, no long tasks over 200 ms while scrolling                                                  |
| Database policies | `supabase test db` (pgTAP)    | Phase 1: every policy and trigger, including member A refused on member B's data                                                                                |
| Contract          | Vitest                        | Phase 1: one Repository suite run against LocalRepository and SupabaseRepository, including every permission refusal                                            |
| Integration       | Vitest + supabase-js          | Phase 1: the contract suite's Supabase run, with four signed-in test users against local Supabase: reads, writes and refusals                                   |
| Server            | Vitest                        | Phase 2: the calendar functions against a fake Google (OAuth, sync, push, next actions, refusals) and the store contract, in memory and in CI on local Supabase |
| End to end (live) | Playwright                    | Phase 1: the main flows against local Supabase with two users, including view only, a rejected forced write and Realtime delivery                               |

**Coverage:** `domain/` ≥ 90% lines; overall ≥ 70%.

**Definition of Done** for every story:
1. It works with keyboard and with mouse, and it has been checked in light and dark.
2. Tests are added at the right layers, and `pnpm test:all` is green.
3. No console errors or warnings in the browser.
4. The copy follows section 3.5, and the visuals follow sections 3.2 to 3.4.
5. `docs/PROGRESS.md` is updated; `docs/DECISIONS.md` too if a choice was made.
6. From Phase 1: every write has a UI check through `can`, a database policy, and a test showing another member is refused; no secret appears in the repository, logs, screenshots or docs.
7. It is committed with a conventional commit message.

---

## 7. Working agreement (agile)

- **Work is split into phases, then milestones, then stories.** Every milestone ends in something that can be demoed.
- **Build vertical slices,** smallest useful thing first. Do not build a layer nobody can see yet.
- **At the end of each milestone:** run all tests, capture light and dark screenshots into `docs/screenshots/`, update `PROGRESS.md` with a "try this" script, and commit. Then continue.
- **At the end of each phase:** stop and report. The founders review a demo, and feedback goes into `BACKLOG.md`. The next phase brief is then written in light of that feedback.
- **Who decides what:** make technical decisions yourself and log them. Product decisions (what a user sees or must do) belong to the founders, so ask instead of guessing. The current code is the design source of truth (§3.2): place new things where the design already puts that kind of thing.
- **Tests and existing behaviour:** never weaken a test to make it pass. If a test is wrong, fix it and say why in the commit. Never delete working features to finish a story.

---

## 8. Phases

### Phase 0: Foundation and walking skeleton (no accounts needed)

Repository, toolchain, every dependency installed and smoke-tested, the design system with a `/design` showcase, the domain model, local data with seed, and the app shell. The shell has branding, member and sheet tabs, a beautiful read-only grid with custom cells, an expandable row with an interactive stage tracker and warmth, search over local data, a calendar panel with sample events, dark mode, full test harness and CI.

**Exit:** the founders can click through the real look and feel, on sample data, in light and dark, and every test layer is green in CI.

### Phase 1: Core CRM, live for the team

Brief: `docs/phases/PHASE_1.md`; plan: `docs/phases/PHASE_1_PLAN.md`. The ownership model (§2.14): everyone sees every tab, only the owner changes it, enforced in the UI, the repositories and the database. Supabase (one project; schema, RLS, email and password sign-in for listed members, Realtime, Storage) and the Supabase repository; static hosting with previews on sample data and manual production releases. Grid editing for every column type, add and delete rows (Trash and undo), the column manager, the sheet manager with templates and a stage editor, and adding members. History timeline, next action, tags library, WhatsApp, call and email buttons. Quick-add language with preview, smart paste and the duplicate check. Search across everything and the Today view. Import of the founders' existing sheet plus xlsx and csv; export to xlsx and PDF, plus export everything. Nightly backup.

**Exit:** every member signs in, works only in their own tab, can view the others' tabs, and has used it daily for a week. The old spreadsheet is retired.

### Phase 2: Connected and smart

Google Calendar connect per member (OAuth, production-unverified), with sync from 5 Nov 2026 onwards, a calendar panel per tab, matching events to contacts, automatic meeting history, and creating events from next actions. PDF import (text layer with layout cues, LinkedIn PDF template) and photo or scanned import (PaddleOCR in the browser, Tesseract fallback), with preview and fill-empty-only on rows. Stale-relationship nudges in Today. A performance and polish pass.

**Exit:** a visiting card photo or a LinkedIn PDF becomes a correct row with one confirmation, and every meeting with a contact appears in their history without typing.

### Backlog (after Phase 2)

Board view (kanban by stage), grouping customers by company, phone quick-add as an installable web app, daily email digest of follow-ups, change history (who edited what).
