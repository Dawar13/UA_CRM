/**
 * Menu items take their icon through the `icon` prop. An icon written as the first child lands
 * inside the label, where it renders as a block and pushes the text onto a second line (fixed in
 * 21 places on 7 Nov 2026). This keeps it from coming back.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  })
}

/** Menu items whose first child is an icon component. */
function iconsInLabels(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(/<(MenuItem|MenuCheckboxItem|MenuSubTrigger)\b/g)) {
    let i = (match.index ?? 0) + match[0].length
    let depth = 0
    for (; i < source.length; i++) {
      const c = source[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    if (source[i - 1] === '/') continue
    const child = /^\s*<([A-Z][A-Za-z0-9]*)\b[^<>]*?aria-hidden[^<>]*?\/>/.exec(source.slice(i + 1))
    if (child?.[1]) found.push(child[1])
  }
  return found
}

describe('menu items', () => {
  it('pass icons through the icon prop, never inside the label', () => {
    const offenders = sourceFiles(join(process.cwd(), 'src')).flatMap((file) =>
      iconsInLabels(readFileSync(file, 'utf8')).map((icon) => `${file}: ${icon}`),
    )
    expect(offenders).toEqual([])
  })

  it('the check finds an icon inside a label', () => {
    expect(
      iconsInLabels(
        '<MenuItem onSelect={() => go({ a: 1 })}>\n  <Trash2 aria-hidden />\n  Delete\n</MenuItem>',
      ),
    ).toEqual(['Trash2'])
    expect(iconsInLabels('<MenuItem icon={<Trash2 aria-hidden />}>Delete</MenuItem>')).toEqual([])
  })
})
