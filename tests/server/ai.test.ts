/**
 * Reading contacts with AI (D-055): the server function against a fake Gemini. Members only,
 * sizes checked, Google's answers mapped to codes, and logs with counts only.
 */
import { describe, expect, it } from 'vitest'
import {
  AiConfigError,
  type AiDeps,
  DEFAULT_AI_MODEL,
  handleRead,
  instructions,
  MAX_FILE_BASE64,
  type ReadRequest,
  readAiEnv,
} from '../../api/_lib/ai'
import { memoryLogger } from '../../api/_lib/log'

const ENV = {
  geminiKey: 'test-gemini-key',
  model: 'gemini-test',
  supabaseUrl: 'https://example.supabase.co',
  supabasePublishableKey: 'sb_publishable_test',
}

const SHEET = {
  name: 'Investors',
  stages: ['Researching', 'Intro asked', 'First meeting'],
  columns: [
    { label: 'Investor type', options: ['Angel', 'VC'] },
    { label: 'Cheque size', options: [] },
  ],
}

const ROHAN = {
  name: 'Rohan Mehta',
  title: 'Partner',
  company: 'Northstar Seed',
  phones: ['+91 98450 12345'],
  emails: ['rohan@northstar.example'],
  fields: [{ label: 'Investor type', value: 'VC' }],
}

function geminiAnswer(body: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }],
    }),
    { status, headers: { 'content-type': 'application/json' } },
  )
}

function setup(answer: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const log = memoryLogger()
  const deps: AiDeps = {
    env: ENV,
    log,
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return answer()
    }) as typeof fetch,
    authenticate: async (request) =>
      request.headers.get('authorization') === 'Bearer member-token' ? 'm-dawar' : null,
    wait: async () => {},
  }
  return { deps, calls, log }
}

function post(body: unknown, token = 'member-token') {
  return new Request('http://local/api/ai/read', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

const TEXT_REQUEST = {
  text: 'Rohan Mehta, partner at Northstar Seed, VC. +91 98450 12345',
  sheet: SHEET,
  today: 'Tue 10 Nov 2026',
}

describe('AI settings', () => {
  it('needs the Gemini key and the Supabase address; the model has a default', () => {
    expect(() => readAiEnv({})).toThrow(AiConfigError)
    try {
      readAiEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co' })
    } catch (error) {
      expect((error as AiConfigError).missing).toEqual([
        'GEMINI_API_KEY',
        'VITE_SUPABASE_PUBLISHABLE_KEY',
      ])
    }
    const env = readAiEnv({
      GEMINI_API_KEY: 'k',
      VITE_SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'p',
    })
    expect(env.model).toBe(DEFAULT_AI_MODEL)
    expect(
      readAiEnv({
        ...{ GEMINI_API_KEY: 'k', SUPABASE_URL: 'u', SUPABASE_PUBLISHABLE_KEY: 'p' },
        AI_MODEL: 'gemini-x',
      }).model,
    ).toBe('gemini-x')
  })
})

describe('reading contacts', () => {
  it('reads text into contacts, with the sheet and today in the instructions', async () => {
    const { deps, calls, log } = setup(() => geminiAnswer({ contacts: [ROHAN] }))
    const response = await handleRead(deps, post(TEXT_REQUEST))
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      contacts: { name: string; title: string; notes: string }[]
    }
    expect(body.contacts).toHaveLength(1)
    expect(body.contacts[0]).toMatchObject({ name: 'Rohan Mehta', title: 'Partner', notes: '' })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',
    )
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['x-goog-api-key']).toBe('test-gemini-key')
    const sent = JSON.parse(String(calls[0]?.init?.body)) as {
      contents: { parts: { text?: string }[] }[]
      generationConfig: { responseMimeType: string; temperature: number }
    }
    expect(sent.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      temperature: 0,
    })
    const prompt = sent.contents[0]?.parts.map((p) => p.text ?? '').join('\n') ?? ''
    expect(prompt).toContain('Today is Tue 10 Nov 2026')
    expect(prompt).toContain('"Researching", "Intro asked", "First meeting"')
    expect(prompt).toContain('- Investor type (one of: Angel, VC)')
    expect(prompt).toContain(TEXT_REQUEST.text)

    // Logs: counts and codes only, never the text or a contact.
    expect(log.lines).toEqual([
      {
        event: 'ai.read',
        fields: expect.objectContaining({ member: 'm-dawar', kind: 'text', contacts: 1 }),
      },
    ])
    expect(JSON.stringify(log.lines)).not.toMatch(/Rohan|Northstar|98450/)
  })

  it('sends a PDF or photo as the file itself, and a CSV as its text', async () => {
    const { deps, calls } = setup(() => geminiAnswer({ contacts: [ROHAN] }))
    const pdf = Buffer.from('%PDF-1.4 card').toString('base64')
    await handleRead(
      deps,
      post({
        ...TEXT_REQUEST,
        text: undefined,
        file: { name: 'card.pdf', mimeType: 'application/pdf', data: pdf },
      }),
    )
    const pdfParts = JSON.parse(String(calls[0]?.init?.body)).contents[0].parts
    expect(pdfParts).toContainEqual({ inlineData: { mimeType: 'application/pdf', data: pdf } })

    const csv = Buffer.from('Name,Company\nRohan Mehta,Northstar Seed').toString('base64')
    await handleRead(
      deps,
      post({
        ...TEXT_REQUEST,
        text: undefined,
        file: { name: 'list.csv', mimeType: 'text/csv', data: csv },
      }),
    )
    const csvParts = JSON.parse(String(calls[1]?.init?.body)).contents[0].parts as {
      text?: string
    }[]
    expect(csvParts.some((p) => p.text?.includes('Rohan Mehta,Northstar Seed'))).toBe(true)
  })

  it('leaves out entries without a name and fills missing fields with empty values', async () => {
    const { deps } = setup(() =>
      geminiAnswer({
        contacts: [{ name: '' }, { name: 'Asha Rao', warmth: 'lukewarm', phones: 'x' }],
      }),
    )
    const body = (await (await handleRead(deps, post(TEXT_REQUEST))).json()) as {
      contacts: Record<string, unknown>[]
    }
    expect(body.contacts).toEqual([
      expect.objectContaining({ name: 'Asha Rao', warmth: '', phones: [], fields: [], notes: '' }),
    ])
  })

  it('refuses anyone who is not a signed-in member', async () => {
    const { deps, calls } = setup(() => geminiAnswer({ contacts: [] }))
    const response = await handleRead(deps, post(TEXT_REQUEST, 'stranger'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
    expect(calls).toHaveLength(0)
  })

  it('refuses nothing to read, a file type it cannot take, and a file that is too large', async () => {
    const { deps, calls } = setup(() => geminiAnswer({ contacts: [] }))
    const empty = await handleRead(deps, post({ ...TEXT_REQUEST, text: '  ' }))
    expect(empty.status).toBe(400)
    const zip = await handleRead(
      deps,
      post({ ...TEXT_REQUEST, file: { name: 'a.zip', mimeType: 'application/zip', data: 'AA==' } }),
    )
    expect(zip.status).toBe(400)
    const big = await handleRead(
      deps,
      post({
        ...TEXT_REQUEST,
        file: {
          name: 'big.pdf',
          mimeType: 'application/pdf',
          data: 'A'.repeat(MAX_FILE_BASE64 + 4),
        },
      }),
    )
    expect(big.status).toBe(413)
    expect(await big.json()).toEqual({ error: 'too_large' })
    expect(calls).toHaveLength(0)
  })

  it.each([
    [429, 'busy', 429, 1],
    [400, 'not_configured', 503, 1],
    [403, 'not_configured', 503, 1],
    [404, 'not_configured', 503, 1],
    [500, 'ai_unavailable', 502, 2],
    [503, 'ai_unavailable', 502, 2],
  ])('Google answering %i is %s', async (googleStatus, code, status, tries) => {
    const { deps, log, calls } = setup(() => new Response('{}', { status: googleStatus }))
    const response = await handleRead(deps, post(TEXT_REQUEST))
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: code })
    expect(calls).toHaveLength(tries)
    expect(log.lines[0]).toMatchObject({
      event: 'ai.read.failed',
      fields: { code, google: googleStatus },
    })
  })

  it('tries once more when Google is briefly overloaded', async () => {
    let n = 0
    const { deps, calls } = setup(() =>
      ++n === 1 ? new Response('{}', { status: 503 }) : geminiAnswer({ contacts: [ROHAN] }),
    )
    const response = await handleRead(deps, post(TEXT_REQUEST))
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(2)
  })

  it('asks for every field, in order, so none is left out', async () => {
    const { deps, calls } = setup(() => geminiAnswer({ contacts: [ROHAN] }))
    await handleRead(deps, post(TEXT_REQUEST))
    const item = JSON.parse(String(calls[0]?.init?.body)).generationConfig.responseSchema.properties
      .contacts.items as { properties: object; required: string[]; propertyOrdering: string[] }
    expect(item.required).toEqual(Object.keys(item.properties))
    expect(item.propertyOrdering).toEqual(item.required)
    expect(item.required[0]).toBe('name')
  })

  it('an answer that is not the JSON asked for, or a blocked input, is unreadable', async () => {
    const notJson = setup(
      () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Sorry' }] } }] })),
    )
    expect((await handleRead(notJson.deps, post(TEXT_REQUEST))).status).toBe(422)
    const blocked = setup(
      () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'OTHER' } })),
    )
    expect(await (await handleRead(blocked.deps, post(TEXT_REQUEST))).json()).toEqual({
      error: 'unreadable',
    })
    const network = setup(() => Promise.reject(new Error('offline')))
    expect((await handleRead(network.deps, post(TEXT_REQUEST))).status).toBe(502)
  })

  it('answers only POST', async () => {
    const { deps } = setup(() => geminiAnswer({ contacts: [] }))
    const response = await handleRead(deps, new Request('http://local/api/ai/read'))
    expect(response.status).toBe(405)
  })

  it('tells the model to invent nothing, and that a sheet without stages has none', () => {
    const request: ReadRequest = { ...TEXT_REQUEST, sheet: { ...SHEET, stages: [], columns: [] } }
    const text = instructions(request)
    expect(text).toContain('Never invent anything')
    expect(text).toContain('stage: always "".')
    expect(text).toContain('- (none)')
    expect(text).toContain('nextDate is never before today (Tue 10 Nov 2026)')
  })

  it('leaves the team out: the writer or reader of an email is not a contact', () => {
    const text = instructions({ ...TEXT_REQUEST, team: ['Dawar', 'Dhruv'] })
    expect(text).toContain("Utopian Autonomy's own team, never contacts: Dawar, Dhruv.")
    expect(instructions(TEXT_REQUEST)).toContain('Leave out the writer and the reader')
  })
})
