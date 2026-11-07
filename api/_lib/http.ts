/** Small helpers for Web-standard Request and Response. */

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } })
}

export function methodNotAllowed(allowed: string): Response {
  return new Response(null, { status: 405, headers: { allow: allowed } })
}

/** The JSON body, or an empty object when there is none or it does not parse. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** The bearer token of a request, or null. */
export function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() || null
}
