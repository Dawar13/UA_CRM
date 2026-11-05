/**
 * Writes src/styles/tokens.css from src/styles/tokens.ts.
 * Run with `pnpm tokens`.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderTokensCss } from '../src/styles/renderTokensCss'

const target = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url))
writeFileSync(target, renderTokensCss(), 'utf8')
console.log(`Wrote ${target}`)
