/**
 * Uploads a folder mirrored by storage-mirror.ts back into the Storage bucket of contact files,
 * at the same paths and with the content types in its .manifest.json. Files already in the
 * bucket are replaced. Used when restoring a backup (docs/RUNBOOK.md).
 *
 * Needs SUPABASE_URL and SUPABASE_SECRET_KEY of the project to restore into.
 *
 * Usage: pnpm exec tsx scripts/backup/storage-restore.ts <folder>
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'row-files'
const MANIFEST = '.manifest.json'

const source = process.argv[2]
const url = process.env.SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SECRET_KEY ?? ''
if (!source || !url || !key) {
  console.error(
    'Usage: storage-restore.ts <folder>, with SUPABASE_URL and SUPABASE_SECRET_KEY set.',
  )
  process.exit(1)
}

const bucket = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
}).storage.from(BUCKET)

const types = JSON.parse(await readFile(join(source, MANIFEST), 'utf8')) as Record<string, string>

let uploaded = 0
for (const [path, contentType] of Object.entries(types)) {
  const content = await readFile(join(source, ...path.split('/')))
  const { error } = await bucket.upload(path, content, { contentType, upsert: true })
  if (error) throw new Error(`An upload failed: ${error.message}`)
  uploaded++
}
console.log(`Files: ${uploaded} restored to Storage.`)
