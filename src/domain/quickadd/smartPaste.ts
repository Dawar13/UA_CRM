/**
 * Where a paste into the grid goes (CLAUDE.md §2.6, rule 9). A block copied from a spreadsheet
 * fills cells; an email signature or profile text goes through the quick-add parser instead.
 *
 * Both can arrive as several lines without tabs (a single spreadsheet column copies that way), so
 * line breaks alone cannot tell them apart. A signature or profile almost always carries a way to
 * reach the person (an email, a phone number, a web address) or a quick-add `key:`; a column of
 * names or companies does not. A spreadsheet also puts an HTML table on the clipboard.
 */

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
/** Eight or more digits, allowing the usual separators and a leading +. */
const PHONE = /\+?\d[\d\s().-]{6,}\d/
const WEB = /\bhttps?:\/\/|\bwww\.|\blinkedin\.com\/|\bwa\.me\//i
const KEY =
  /^\s*(why|rel|via|intro|next|stage|s|note|n|loc|title|co|company|phone|email|m|mob|mobile|tel)\s*:/im

export function isContactText(text: string, html = ''): boolean {
  if (text.includes('\t') || /<table[\s>]/i.test(html)) return false
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length < 2) return false
  return EMAIL.test(text) || PHONE.test(text) || WEB.test(text) || KEY.test(text)
}
