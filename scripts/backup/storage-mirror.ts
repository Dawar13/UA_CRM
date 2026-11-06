/**
 * Mirrors the Storage bucket of contact files into a folder of the backup repository:
 * downloads what is new, removes what was deleted, leaves the rest alone. Git keeps one copy of
 * each file however many nights it is backed up, and older versions stay in its history.
 *
 * Each file's content type goes into .manifest.json in the folder, for storage-restore.ts.
 *
 * Needs SUPABASE_URL and SUPABASE_SECRET_KEY. The logs of this repository are public, so this
 * prints counts only, never file names.
 *
 * Usage: pnpm exec tsx scripts/backup/storage-mirror.ts <folder>
 */
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'row-files'
const PAGE = 1000
const SAFE_PART = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const MANIFEST = '.manifest.json'

interface Remote {
  size: number
  type: string
}

const target = process.argv[2]
const url = process.env.SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SECRET_KEY ?? ''
if (!target || !url || !key) {
  console.error('Usage: storage-mirror.ts <folder>, with SUPABASE_URL and SUPABASE_SECRET_KEY set.')
  process.exit(1)
}

const bucket = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
}).storage.from(BUCKET)

/** Every object in the bucket by path. Folders are walked, never stored. */
async function listRemote(prefix = '', found = new Map<string, Remote>()) {
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`Listing the bucket failed: ${error.message}`)
    for (const entry of data) {
      if (!SAFE_PART.test(entry.name)) throw new Error('The bucket holds an unexpected path.')
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === null) await listRemote(path, found)
      else
        found.set(path, {
          size: Number(entry.metadata?.size ?? -1),
          type: String(entry.metadata?.mimetype ?? 'application/octet-stream'),
        })
    }
    if (data.length < PAGE) return found
  }
}

async function listLocal(folder: string): Promise<Map<string, number>> {
  const found = new Map<string, number>()
  await mkdir(folder, { recursive: true })
  for (const name of await readdir(folder, { recursive: true })) {
    if (name === MANIFEST) continue
    const full = join(folder, name)
    const info = await stat(full)
    if (info.isFile()) found.set(relative(folder, full).split(sep).join('/'), info.size)
  }
  return found
}

const remote = await listRemote()
const local = await listLocal(target)

let removed = 0
for (const path of local.keys()) {
  if (!remote.has(path)) {
    await rm(join(target, path))
    removed++
  }
}

let downloaded = 0
let bytes = 0
for (const [path, { size }] of remote) {
  if (local.get(path) === size) continue
  const { data, error } = await bucket.download(path)
  if (error) throw new Error(`A download failed: ${error.message}`)
  const content = Buffer.from(await data.arrayBuffer())
  await mkdir(dirname(join(target, path)), { recursive: true })
  await writeFile(join(target, path), content)
  downloaded++
  bytes += content.length
}

const manifest = Object.fromEntries([...remote].map(([path, { type }]) => [path, type]))
await writeFile(join(target, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(
  `Files: ${remote.size} in Storage; ${downloaded} downloaded (${(bytes / 1048576).toFixed(1)} MB), ${removed} removed.`,
)
