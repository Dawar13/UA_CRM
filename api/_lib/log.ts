/**
 * Server logs (D-050): one JSON line per event with ids, counts and error codes only. Never event
 * titles, emails, attendee names or tokens.
 */
export type LogValue = string | number | boolean | null | undefined
export type Logger = (event: string, fields?: Record<string, LogValue>) => void

export const consoleLogger: Logger = (event, fields = {}) => {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }))
}

/** A logger that keeps lines in memory (tests check no personal data leaks into them). */
export function memoryLogger(): Logger & {
  lines: { event: string; fields: Record<string, LogValue> }[]
} {
  const lines: { event: string; fields: Record<string, LogValue> }[] = []
  const log = ((event: string, fields: Record<string, LogValue> = {}) => {
    lines.push({ event, fields })
  }) as Logger & { lines: typeof lines }
  log.lines = lines
  return log
}
