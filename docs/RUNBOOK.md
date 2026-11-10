# Runbook

How the live CRM is set up, released, backed up and restored. Written for the founders; no step needs Docker or anything installed beyond what is named.

**Never paste a key, password or connection string into this repository, an issue, a chat or a screenshot.** The repository is public. Settings live in Vercel, in GitHub (Settings → Secrets and variables → Actions) and in Supabase.

---

## 1. What runs, and when

| What           | When                              | What it does                                                                                                                                                                                               |
| -------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel         | Every push to `main`              | Builds the app from the repository and puts it live at the production URL (`vercel.json` holds the build settings)                                                                                         |
| CI             | Every push to `main`              | Lint, types, unit and component tests, browser tests on sample data, and the database tests on a throwaway local Supabase (pgTAP, the repository contract, live browser tests with two invented members)   |
| Nightly backup | 02:00 IST every night, or by hand | Dumps the database and mirrors the stored files into the private `ua-crm-backups` repository, keeps the newest 30 dumps, then restores the dump into a scratch database and checks every table's row count |
| Calendar job   | 06:00 IST every day               | Syncs every connected Google Calendar and renews Google's push channels (§7)                                                                                                                               |

A failed scheduled backup emails whoever last changed the schedule line in `.github/workflows/backup.yml`. The daily dump also keeps the free Supabase project from pausing after a week without use.

---

## 2. One-time setup

### 2.1 Supabase (project `ua-crm`, already created)

1. **Logins:** Authentication → Users → Add user → Create new user, with "Auto Confirm User" ticked, for each founder.
2. **Team list:** SQL editor. **Replace both placeholders, angle brackets included, with each person's login email exactly as in Authentication → Users** before running; an address that differs by a letter cannot sign in. This runs once; after it, admins add members from the app (More → Team).

   ```sql
   insert into public.members (name, email, slug, position, is_admin, active) values
     ('Dawar', '<Dawar''s login email>', 'dawar', 0, true, true),
     ('Dhruv', '<Dhruv''s login email>', 'dhruv', 1, true, true);
   ```

3. **URLs** (once Vercel gives you the production URL): Authentication → URL Configuration → Site URL is the production URL; add `http://localhost:5173` under Redirect URLs.

### 2.2 Vercel (about 3 minutes)

1. Add New → Project → import `Dawar13/UA_CRM`. Keep the settings Vercel shows; `vercel.json` overrides what matters.
2. Before deploying, open Environment Variables and add three, for **Production** only:
   - `VITE_DATA` = `supabase`
   - `VITE_SUPABASE_URL` = the Project URL (Supabase → Project Settings → Data API)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the publishable key (Supabase → Project Settings → API Keys)
3. Deploy. Previews of other branches get no variables, so they run on sample data.

### 2.3 Backups (about 5 minutes)

1. On GitHub: New repository → `ua-crm-backups`, **Private**, tick "Add a README file" (the workflow cannot check out an empty repository).
2. A token that can write only there: GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
   - Resource owner: `Dawar13`. Repository access: Only select repositories → `ua-crm-backups`.
   - Permissions: Repository → Contents → Read and write (Metadata read-only comes with it).
   - Expiry: one year, with a calendar reminder to renew it.
3. In this repository: Settings → Secrets and variables → Actions → New repository secret, four times:

| Secret                | Where it comes from                                                                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_DB_URL`     | Supabase → Connect → **Session pooler** connection string (port 5432), with the database password in place of `[YOUR-PASSWORD]`. Characters such as `@ : / ? #` in the password must be percent-encoded. Not the direct connection: GitHub's runners have no IPv6 |
| `SUPABASE_URL`        | Supabase → Project Settings → Data API → Project URL                                                                                                                                                                                                              |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → Secret keys → New secret key, named `github-backup` so it can be revoked on its own                                                                                                                                      |
| `BACKUP_REPO_TOKEN`   | The token from step 2                                                                                                                                                                                                                                             |

4. Actions → Nightly backup → Run workflow, once, to check it passes. It names any missing secret.

---

## 3. Releasing

Pushing to `main` is the release: Vercel builds and goes live in a minute or two. Wait for CI to pass when a push changes behaviour.

**Database changes** ship as migrations in `supabase/migrations/`. Apply them before pushing the code that needs them: `pnpm exec supabase db push --remote` (the CLI asks for the database password). Migrations only ever add or adjust.

**Rolling back the app:** Vercel → Deployments → the previous production deployment → Instant Rollback. The database stays as it is; a fix to it is a new migration.

---

## 4. Backups

The `ua-crm-backups` repository holds:

```
db/2026-11-07/roles.sql.gz     cluster roles
db/2026-11-07/schema.sql.gz    tables, functions, policies, triggers
db/2026-11-07/data.sql.gz      every row, including logins (password hashes) and Storage metadata
db/2026-11-07/counts.txt       rows per table, checked after the nightly restore
files/<member>/<row>/<file>    the contact files, mirrored (one copy each; deleted files stay in git history)
files/.manifest.json           each file's content type
```

- **Run one now:** Actions → Nightly backup → Run workflow.
- **Restore check:** every night the dump is restored into a scratch Supabase on the runner and each table's row count compared with `counts.txt`. If it fails, the dump is still saved; the error names the table or the first psql error (values masked).
- **Size:** dumps are kilobytes for hundreds of contacts. Files are capped at 10 MB each, and the free Storage limit (1 GB) keeps the mirror inside GitHub's recommended repository size.

---

## 5. Restoring

Use this if the project is lost or damaged. It restores into a **new, empty** Supabase project (the free plan allows two).

### 5.1 The database

1. Create a new project in Supabase (Mumbai region if available) and note its database password.
2. Install the PostgreSQL 17 command-line tools (on Windows: the EnterpriseDB installer, "Command Line Tools" only).
3. Get the backup: clone `ua-crm-backups`, pick a folder `db/<date>`, and unzip its three `.gz` files (7-Zip, or `gunzip -k *.gz`).
4. Restore, with the new project's session pooler connection string:

   ```sh
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql \
     --dbname "<new session pooler connection string>"
   ```

   It either restores everything or nothing. Logins come back with their passwords.

### 5.2 The files

With Node and this repository installed (`pnpm install`), from the repository folder:

```sh
SUPABASE_URL=<new project URL> SUPABASE_SECRET_KEY=<new secret key> \
  pnpm exec tsx scripts/backup/storage-restore.ts <path to ua-crm-backups>/files
```

### 5.3 Pointing everything at the new project

1. Update the three Supabase secrets in GitHub (2.3), the two Supabase variables in Vercel (2.2) and the two values in your local `.env`.
2. Link the CLI: `pnpm exec supabase link --project-ref <new ref>`.
3. Vercel → Deployments → Redeploy the latest production deployment, so it picks up the new variables.
4. Supabase → Authentication → URL Configuration, as in 2.1.
5. Run the nightly backup by hand once and check it passes.

---

## 6. If a secret leaks

Revoke it where it was made (Supabase API keys, or the database password under Project Settings → Database, or the GitHub token), create a new one, and update it in GitHub (2.3). For the calendar: a leaked Google client secret is reset under Google Auth Platform → Clients; a leaked `CALENDAR_TOKEN_KEY` follows §7.5 step 3; a leaked `CRON_SECRET` is simply replaced in Vercel. Then redeploy. The publishable key is designed to be public; the database's row-level security is what protects the data.

---

## 7. Google Calendar

Each member connects their own Google Calendar from the side panel (or ⋯ → Connect Google Calendar). Sign-in stays email and password. How it works: `docs/DECISIONS.md` D-050 to D-052.

### 7.1 Google Cloud (once, about 10 minutes)

1. Go to console.cloud.google.com, sign in with the founders' Google account, and create a project named **UA Internal CRM**.
2. **APIs and services → Library →** search "Google Calendar API" → **Enable**.
3. **Google Auth Platform → Branding:** app name **UA Internal CRM**, your support email, and your email as developer contact. **Audience:** External. **Data access → Add or remove scopes:** `openid`, `.../auth/userinfo.email` and `https://www.googleapis.com/auth/calendar.events.owned` (paste it under "Manually add scopes").
4. **Audience → Publish app**, so the app is "In production". Do not submit it for verification. Testing mode would end every connection after 7 days; production without verification only shows each member a warning once, and allows up to 100 Google accounts.
5. **Clients → Create client →** Web application, named "UA Internal CRM". Authorised redirect URIs, both:
   - `https://<your production domain>/api/calendar/callback`
   - `http://localhost:5173/api/calendar/callback`
6. Copy the client ID and the client secret straight into Vercel (7.2). Do not save them anywhere else.

### 7.2 Vercel variables (Settings → Environment Variables, Production only)

Generate the two random values on your own computer, in PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run it twice: once for `CALENDAR_TOKEN_KEY`, once for `CRON_SECRET`.

| Name                           | Value                                                                                                                 | Sensitive |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------- |
| `GOOGLE_CLIENT_ID`             | From 7.1                                                                                                              | No        |
| `GOOGLE_CLIENT_SECRET`         | From 7.1                                                                                                              | Yes       |
| `CALENDAR_TOKEN_KEY`           | The first random value                                                                                                | Yes       |
| `CALENDAR_TOKEN_KEY_VERSION`   | `1` (optional; 1 is the default)                                                                                      | No        |
| `CRON_SECRET`                  | The second random value (Vercel sends it to the daily job)                                                            | Yes       |
| `APP_BASE_URL`                 | `https://<your production domain>`, no slash at the end                                                               | No        |
| `CALENDAR_SUPABASE_SECRET_KEY` | A secret key of the **ua-crm** project: Supabase → ua-crm → Project Settings → API Keys → Secret keys (`sb_secret_…`) | Yes       |

The server takes the project URL and publishable key from your existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, so it always uses the project the app signs in to. A Vercel Supabase integration may add its own `SUPABASE_URL` and keys, possibly for another project; the server ignores them when these are set. None of the new names may start with `VITE_`: that would put them in the browser. Then **Deployments → Redeploy** the latest production deployment.

### 7.3 Database

Apply the migrations before pushing the code that needs them. In PowerShell, in the repository folder:

```powershell
.\node_modules\.bin\supabase.cmd db push --remote
```

It lists `20261107150000_cell_format.sql` and `20261108090000_calendar.sql`; confirm with `y`.

### 7.4 First connection, and what to check

0. Open `https://<your production domain>/api/calendar/health`. It lists which settings the server sees (names only), the kind of secret key it holds, the Supabase project it uses and whether that database accepts the key; `"ok": true` means ready. Then open `https://<your production domain>/api/calendar/callback` in the browser. If you land back in the CRM with "That connection link expired. Connect again.", the functions are live and have their settings. "404" means the deployment has no functions; `{"error":"not_configured"}` means a variable is missing (Vercel → Logs names it).
1. Open the production app, sign in, open the side panel (Ctrl+.) and choose **Connect Google Calendar**.
2. Google says it has not verified the app: **Advanced → Go to UA Internal CRM**, then allow calendar access.
3. You come back to the CRM with "Google Calendar connected", and the panel shows this week.

Then check these, and tell Claude what you saw:

- **Invitations.** An event someone else invited you to shows in the panel. If invitations are missing, add the variable `GOOGLE_CALENDAR_SCOPE` = `https://www.googleapis.com/auth/calendar.events`, add that scope in 7.1 step 3, redeploy, then ⋯ → Disconnect calendar and connect again.
- **Live updates.** In Supabase → SQL editor, run `select status, last_result ->> 'channel' as push, channel_expires_at from calendar_connections;`. `open` means Google sends changes straight away. Anything else (for example `push_unauthorized`) means Google refused the address; the calendar still refreshes every 15 minutes and when the app opens.
- **Meetings.** Create a short event in Google Calendar with a contact's email as a guest. It appears in the panel with the contact's name (within a minute when push is on). After it ends and the next sync runs, the contact's history shows a Meeting entry.
- **Next actions.** On one of your rows with an exact next-action day, choose **Add to calendar**. The event appears in Google Calendar. Move it to another day in Google: the next action follows, with a note in its history.

### 7.5 Rotating the token key

1. Generate a new key (7.2). In Vercel set `CALENDAR_TOKEN_KEYS_PREVIOUS` to `1:<the old key>` (add `,2:<key>` and so on for later rotations), `CALENDAR_TOKEN_KEY` to the new key and `CALENDAR_TOKEN_KEY_VERSION` to `2`. Redeploy.
2. Existing connections keep working through the previous key; new connections use the new one. When every member has reconnected once, the old key can be dropped from the list.
3. If a key has leaked, drop it at once instead. Members whose tokens it sealed see "Google access ended" and reconnect.

### 7.6 Limits and restores

- Everything stays on free tiers: Google's Calendar API quota is far above two members' use, and Vercel Hobby allows the one daily job and these functions.
- A database restore (§5) brings the calendar tables back with the tokens still sealed; the same `CALENDAR_TOKEN_KEY` opens them. If the production address changes, update `APP_BASE_URL` and the redirect URI in 7.1, and each member disconnects and connects again so Google's push uses the new address.
