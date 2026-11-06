/**
 * Before the live tests: Dawar and Dhruv as members with logins, and Dhruv with one sheet and one
 * row for Dawar to look at (and fail to change). A stranger has a login but no membership.
 */
import { clearProject, DHRUV_ROW, DHRUV_SHEET, LIVE_PASSWORD, live, serviceClient } from './team'

export default async function setup(): Promise<void> {
  const service = serviceClient()
  await clearProject(service)
  const inserted = await service
    .from('members')
    .insert([
      {
        email: live.dawar.email,
        name: live.dawar.name,
        slug: live.dawar.slug,
        position: 0,
        is_admin: true,
      },
      {
        email: live.dhruv.email,
        name: live.dhruv.name,
        slug: live.dhruv.slug,
        position: 1,
        is_admin: true,
      },
      // Listed only while the stranger's login is made (the sign-up gate allows members only).
      {
        email: live.stranger.email,
        name: 'Stranger',
        slug: 'stranger',
        position: 2,
        is_admin: false,
      },
    ])
    .select('id, slug')
  if (inserted.error) throw new Error(inserted.error.message)
  for (const who of [live.dawar, live.dhruv, live.stranger]) {
    const created = await service.auth.admin.createUser({
      email: who.email,
      password: LIVE_PASSWORD,
      email_confirm: true,
    })
    if (created.error) throw new Error(created.error.message)
  }
  await service.from('members').delete().eq('slug', 'stranger')

  const dhruvId = inserted.data?.find((m) => m.slug === 'dhruv')?.id
  const sheetId = DHRUV_SHEET
  // Owners of columns and rows follow the sheet (database triggers).
  const sheet = await service.from('sheets').insert({
    id: sheetId,
    owner_id: dhruvId,
    slug: 'connectors',
    name: 'Connectors',
    template: 'connectors',
  })
  if (sheet.error) throw new Error(sheet.error.message)
  const columns = await service.from('columns').insert([
    {
      sheet_id: sheetId,
      key: 'name',
      label: 'Name',
      type: 'text',
      system: true,
      width: 200,
      position: 0,
    },
    {
      sheet_id: sheetId,
      key: 'company',
      label: 'Company',
      type: 'text',
      system: true,
      width: 180,
      position: 1,
    },
  ])
  if (columns.error) throw new Error(columns.error.message)
  const row = await service.from('rows').insert({
    id: DHRUV_ROW,
    sheet_id: sheetId,
    name: 'Kiran Sethi',
    company: 'Sethi Capital',
  })
  if (row.error) throw new Error(row.error.message)
}
