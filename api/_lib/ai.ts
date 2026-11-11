/**
 * Reading contacts with AI (D-055): free text, a PDF, a photo or a small CSV goes to Google's
 * Gemini API (free tier) with the sheet's columns and stages, and comes back as contacts. The key
 * stays on the server; the browser sends its Supabase sign-in, so only members can use it. Logs
 * carry counts and codes only, never the text, the file or a contact.
 */
import { z } from 'zod'
import { bearer, json, methodNotAllowed, readJson } from './http.js'
import { consoleLogger, type Logger } from './log.js'
import { memberForToken } from './supabaseStore.js'

export const DEFAULT_AI_MODEL = 'gemini-flash-lite-latest'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/** Text up to this many characters; a file up to 3 MB (Vercel takes bodies up to 4.5 MB). */
export const MAX_TEXT = 60_000
export const MAX_FILE_BASE64 = 4_000_000
export const FILE_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'text/csv',
  'text/plain',
] as const

export interface AiEnv {
  geminiKey: string
  model: string
  supabaseUrl: string
  supabasePublishableKey: string
}

export class AiConfigError extends Error {
  readonly missing: readonly string[]
  constructor(missing: readonly string[]) {
    super(`Missing AI settings: ${missing.join(', ')}`)
    this.name = 'AiConfigError'
    this.missing = missing
  }
}

export function readAiEnv(source: Record<string, string | undefined> = process.env): AiEnv {
  const get = (name: string) => source[name]?.trim() ?? ''
  const env = {
    geminiKey: get('GEMINI_API_KEY'),
    model: get('AI_MODEL') || DEFAULT_AI_MODEL,
    supabaseUrl: get('VITE_SUPABASE_URL') || get('SUPABASE_URL'),
    supabasePublishableKey: get('VITE_SUPABASE_PUBLISHABLE_KEY') || get('SUPABASE_PUBLISHABLE_KEY'),
  }
  const missing = [
    ...(env.geminiKey ? [] : ['GEMINI_API_KEY']),
    ...(env.supabaseUrl ? [] : ['VITE_SUPABASE_URL']),
    ...(env.supabasePublishableKey ? [] : ['VITE_SUPABASE_PUBLISHABLE_KEY']),
  ]
  if (missing.length > 0) throw new AiConfigError(missing)
  return env
}

// ---------- What the browser sends ----------

const sheetSchema = z.object({
  name: z.string().max(100),
  stages: z.array(z.string().max(80)).max(30),
  columns: z
    .array(z.object({ label: z.string().max(80), options: z.array(z.string().max(80)).max(40) }))
    .max(60),
})

export const readRequestSchema = z
  .object({
    text: z.string().max(MAX_TEXT).optional(),
    file: z
      .object({
        name: z.string().max(200),
        mimeType: z.enum(FILE_TYPES),
        data: z.string().max(MAX_FILE_BASE64),
      })
      .optional(),
    sheet: sheetSchema,
    /** Today in IST, "Tue 10 Nov 2026", for relative dates. */
    today: z.string().max(40),
    /** The team's names, so the writer or reader of an email is not read as a contact. */
    team: z.array(z.string().max(100)).max(30).optional(),
  })
  .refine((r) => (r.text?.trim() ?? '') !== '' || r.file !== undefined, 'nothing to read')

export type ReadRequest = z.infer<typeof readRequestSchema>

// ---------- What comes back ----------

const text = z.string().max(4000).catch('')
const list = z.array(z.string().max(400)).max(20).catch([])

export const aiContactSchema = z.object({
  name: z.string().max(200),
  title: text,
  company: text,
  location: text,
  phones: list,
  emails: list,
  linkedin: text,
  links: list,
  warmth: z.enum(['warm', 'waiting', 'cold', '']).catch(''),
  stage: text,
  tags: list,
  introducedBy: text,
  nextAction: text,
  nextDate: text,
  notes: text,
  fields: z
    .array(z.object({ label: z.string().max(80), value: z.string().max(2000) }))
    .max(60)
    .catch([]),
})

export type AiContact = z.infer<typeof aiContactSchema>

const STRING = { type: 'STRING' } as const
const STRINGS = { type: 'ARRAY', items: STRING } as const

/**
 * Every field, in the order the model should write them. All are required: when only the name
 * was, Gemini left out nearly everything else (seen live, 11 Nov 2026), so an empty field is ""
 * or [] instead of missing.
 */
const CONTACT_FIELDS = [
  'name',
  'title',
  'company',
  'location',
  'phones',
  'emails',
  'linkedin',
  'links',
  'warmth',
  'stage',
  'tags',
  'introducedBy',
  'nextAction',
  'nextDate',
  'notes',
  'fields',
] as const

/** The JSON Gemini must return (its OpenAPI subset). */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    contacts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: STRING,
          title: STRING,
          company: STRING,
          location: STRING,
          phones: STRINGS,
          emails: STRINGS,
          linkedin: STRING,
          links: STRINGS,
          warmth: STRING,
          stage: STRING,
          tags: STRINGS,
          introducedBy: STRING,
          nextAction: STRING,
          nextDate: STRING,
          notes: STRING,
          fields: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { label: STRING, value: STRING },
              required: ['label', 'value'],
              propertyOrdering: ['label', 'value'],
            },
          },
        },
        required: CONTACT_FIELDS,
        propertyOrdering: CONTACT_FIELDS,
      },
    },
  },
  required: ['contacts'],
} as const

export function instructions(request: ReadRequest): string {
  const { sheet } = request
  const columns = sheet.columns
    .map((c) =>
      c.options.length > 0 ? `- ${c.label} (one of: ${c.options.join(', ')})` : `- ${c.label}`,
    )
    .join('\n')
  const team = request.team ?? []
  return [
    `You read contacts for the CRM of Utopian Autonomy, an Indian startup. The contacts go into the sheet "${sheet.name}". Today is ${request.today} (India time).`,
    'Return every person in the input, one entry each, in order. Skip entries that are only a company with no person.',
    team.length > 0
      ? `These people are Utopian Autonomy's own team, never contacts: ${team.join(', ')}. Leave them out, for example as the writer or reader of an email, but they can be the one who introduced someone.`
      : 'Leave out the writer and the reader of a message unless the input is about them.',
    'Never invent anything: leave a field empty ("" or []) when the input does not say it. Never put one person\'s details on another.',
    'name: the full name only, without titles like Mr, Dr or Shri. title: their job title. company: their organisation. location: city or plant location.',
    'phones: as written, with the country code if shown. emails, links: as written. linkedin: their linkedin.com/in/ address.',
    'warmth: "warm", "waiting" or "cold" only if the input clearly says how engaged they are; otherwise "".',
    sheet.stages.length > 0
      ? `stage: one of ${sheet.stages.map((s) => `"${s}"`).join(', ')}, only if the input says that step has happened (a stage named, or "first call done"); a wish such as "wants a pilot" is not a stage. Otherwise "".`
      : 'stage: always "".',
    'tags: a few short lowercase labels the input supports, such as an industry ("foundry", "pharma") or a network ("iit bombay alumni"). No more than four.',
    'introducedBy: the name of whoever introduced them, if said.',
    `nextAction and nextDate: the one next step still to do, if the input gives one. nextDate like "14 Nov", "Tue", "mid Nov", "early Dec" or "Nov 2026"; "" if no date. nextDate is never before today (${request.today}): a past date, such as when you met or last spoke, goes in notes ("Met 12 Oct"), and nextDate stays "".`,
    `fields: values for these columns of the sheet, using the label exactly as written here, only when the input says them:\n${columns || '- (none)'}`,
    "notes: everything else useful about the person or the relationship, in the input's own words, briefly. Do not repeat what is in other fields.",
  ].join('\n')
}

// ---------- The handler ----------

export interface AiDeps {
  env: AiEnv
  fetch: typeof fetch
  log: Logger
  /** The member's id for a request's bearer token, or null. */
  authenticate: (request: Request) => Promise<string | null>
  /** Waits before the retry; tests skip the pause. */
  wait?: (ms: number) => Promise<void>
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class AiError extends Error {
  readonly code: string
  readonly status: number
  /** Google's HTTP status, for the log. */
  readonly upstream: number | undefined
  constructor(code: string, status: number, upstream?: number) {
    super(`AI: ${code}`)
    this.name = 'AiError'
    this.code = code
    this.status = status
    this.upstream = upstream
  }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
}

export async function callGemini(deps: AiDeps, request: ReadRequest): Promise<AiContact[]> {
  const parts: Record<string, unknown>[] = [{ text: instructions(request) }]
  if (request.text?.trim()) parts.push({ text: `Input:\n${request.text}` })
  if (request.file) {
    parts.push(
      request.file.mimeType.startsWith('text/')
        ? {
            text: `Input file "${request.file.name}":\n${Buffer.from(request.file.data, 'base64').toString('utf8')}`,
          }
        : { inlineData: { mimeType: request.file.mimeType, data: request.file.data } },
    )
  }
  const send = () =>
    deps.fetch(`${GEMINI_BASE}/models/${encodeURIComponent(deps.env.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': deps.env.geminiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16_000,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    })
  let response = await send()
  // The free tier is often briefly overloaded (500 or 503): one more try after a pause.
  if (response.status === 500 || response.status === 503) {
    await (deps.wait ?? pause)(1500)
    response = await send()
  }
  if (response.status === 429) throw new AiError('busy', 429, 429)
  if ([400, 401, 403, 404].includes(response.status)) {
    // A wrong or disabled key, or a model name Google does not know.
    throw new AiError('not_configured', 503, response.status)
  }
  if (!response.ok) throw new AiError('ai_unavailable', 502, response.status)
  const body = (await response.json()) as GeminiResponse
  if (body.promptFeedback?.blockReason) throw new AiError('unreadable', 422)
  const raw = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new AiError('unreadable', 422)
  }
  const contacts = (parsed as { contacts?: unknown })?.contacts
  if (!Array.isArray(contacts)) throw new AiError('unreadable', 422)
  return contacts
    .map((c) => aiContactSchema.safeParse(c))
    .filter((r) => r.success && r.data.name.trim() !== '')
    .map((r) => r.data as AiContact)
}

export async function handleRead(deps: AiDeps, request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  const memberId = await deps.authenticate(request)
  if (!memberId) return json({ error: 'unauthorized' }, 401)
  const parsed = readRequestSchema.safeParse(await readJson(request))
  if (!parsed.success) {
    const tooLarge = parsed.error.issues.some((i) => i.code === 'too_big')
    return json({ error: tooLarge ? 'too_large' : 'bad_request' }, tooLarge ? 413 : 400)
  }
  const started = Date.now()
  const kind = parsed.data.file ? parsed.data.file.mimeType : 'text'
  try {
    const contacts = await callGemini(deps, parsed.data)
    deps.log('ai.read', {
      member: memberId,
      kind,
      contacts: contacts.length,
      ms: Date.now() - started,
    })
    return json({ contacts })
  } catch (error) {
    if (error instanceof AiError) {
      deps.log('ai.read.failed', {
        member: memberId,
        kind,
        code: error.code,
        google: error.upstream,
      })
      return json({ error: error.code }, error.status)
    }
    deps.log('ai.read.failed', { member: memberId, kind, code: 'error' })
    return json({ error: 'ai_unavailable' }, 502)
  }
}

/** The Vercel function: production settings, Supabase sign-in, the real Gemini. */
export function aiRoute() {
  return {
    async fetch(request: Request): Promise<Response> {
      let env: AiEnv
      try {
        env = readAiEnv()
      } catch (error) {
        if (error instanceof AiConfigError) {
          consoleLogger('ai.config.missing', { names: error.missing.join(',') })
          return json({ error: 'not_configured' }, 503)
        }
        throw error
      }
      return handleRead(
        {
          env,
          fetch: (input, init) => fetch(input, init),
          log: consoleLogger,
          async authenticate(req) {
            const token = bearer(req)
            if (!token) return null
            const member = await memberForToken(env.supabaseUrl, env.supabasePublishableKey, token)
            return member?.id ?? null
          },
        },
        request,
      )
    },
  }
}
