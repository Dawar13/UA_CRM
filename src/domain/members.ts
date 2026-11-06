/** Team members: names and emails as stored. Pure. */
import { normaliseEmail } from './identity'

/** A team change that cannot be made. Sentence case, ready to show. */
export class MemberRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MemberRuleError'
  }
}

/** Trimmed, with single spaces. Throws when empty. */
export function cleanMemberName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (clean === '') throw new MemberRuleError('A member needs a name')
  return clean
}

/** The Google email as stored and matched: lowercased. Throws when it is not an email. */
export function cleanMemberEmail(email: string): string {
  const clean = normaliseEmail(email)
  if (clean === null) throw new MemberRuleError("That email address doesn't look right")
  return clean
}
