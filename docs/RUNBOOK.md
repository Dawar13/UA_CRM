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

A failed scheduled backup emails whoever last changed the schedule line in `.github/workflows/backup.yml`. The daily dump also keeps the free Supabase project from pausing after a week without use.

---

## 2. One-time setup

### 2.1 Supabase (project `ua-crm`, already created)

1. **Logins:** Authentication → Users → Add user → Create new user, with "Auto Confirm User" ticked, for each founder.
2. **Team list:** SQL editor, with each person's login email in place of the placeholders. This runs once; after it, admins add members from the app (More → Team).

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

Revoke it where it was made (Supabase API keys, or the database password under Project Settings → Database, or the GitHub token), create a new one, and update it in GitHub (2.3). The publishable key is designed to be public; the database's row-level security is what protects the data.
