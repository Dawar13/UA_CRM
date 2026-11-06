/**
 * The main flows against Supabase with two signed-in members (Phase 1): sign in, start a tab,
 * add a row that persists, see the other member's tab view only, have a write forced from the
 * browser console refused by the database itself, and see the other member's change arrive live.
 */
import { expect, type Page, test } from '@playwright/test'
import { DHRUV_ROW, DHRUV_SHEET, LIVE_PASSWORD, live } from './team'

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('sign-in')).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(LIVE_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe
  .serial('live, against Supabase', () => {
    test('a stranger with a login is told they are not on the team', async ({ page }) => {
      await signIn(page, live.stranger.email)
      await expect(page.getByRole('alert')).toHaveText(
        "This account isn't on the UA team list. Ask a founder to add you.",
      )
      await expect(page.getByTestId('sign-in')).toBeVisible()
    })

    test('Dawar signs in, starts a tab and adds a row that persists', async ({ page }) => {
      await signIn(page, live.dawar.email)
      await expect(page).toHaveURL(/\/m\/dawar/)
      await page.getByRole('button', { name: 'Start with the UA templates' }).click()
      const tabs = page.getByRole('tablist', { name: 'Sheets' }).getByRole('tab')
      await expect(tabs).toHaveCount(5)
      await page.getByTestId('sheet-grid').focus()
      await page.keyboard.press('n')
      await expect(page.getByTestId('cell-editor')).toBeVisible()
      await page.keyboard.type('Live Test Person')
      const saved = page.waitForResponse((r) => r.url().includes('/rpc/api_save_row'))
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('sheet-grid').getByText('Live Test Person')).toBeVisible()
      // The row shows at once; the reload waits for the save, as the leave-page guard would.
      expect((await saved).ok()).toBe(true)
      await page.reload()
      await expect(page.getByTestId('sheet-grid').getByText('Live Test Person')).toBeVisible()
    })

    test("Dhruv's tab is view only, and a forced write is refused by the database", async ({
      page,
    }) => {
      await signIn(page, live.dawar.email)
      await expect(page).toHaveURL(/\/m\/dawar/)
      await page
        .getByRole('tablist', { name: 'Team members' })
        .getByRole('tab', { name: 'Dhruv' })
        .click()
      await expect(page.getByTestId('view-only-note')).toHaveText("Dhruv's tab, view only")
      await expect(page.getByTestId('sheet-grid').getByText('Kiran Sethi')).toBeVisible()
      await expect(page.getByTestId('add-row')).toHaveCount(0)

      // From the console, past the UI: save Dhruv's row through the API, then update the table.
      const result = await page.evaluate(
        async ({ rowId, sheetId }) => {
          const client = window.__uaSupabase
          if (!client) return { rpcCode: 'no client', updated: -1, name: '' }
          const saved = await client.rpc('api_save_row', {
            p_row: { id: rowId, sheetId, name: 'Forced' },
          })
          const updated = await client
            .from('rows')
            .update({ name: 'Forced' })
            .eq('id', rowId)
            .select('id')
          const after = await client.from('rows').select('name').eq('id', rowId).single()
          return {
            rpcCode: saved.error?.code ?? null,
            updated: (updated.data ?? []).length,
            name: after.data?.name ?? '',
          }
        },
        { rowId: DHRUV_ROW, sheetId: DHRUV_SHEET },
      )
      // The function is refused by row-level security; the plain update matches no row it may
      // change; the row is untouched.
      expect(result).toEqual({ rpcCode: '42501', updated: 0, name: 'Kiran Sethi' })
    })

    test("Dhruv's new row appears live in Dawar's view of his tab", async ({ browser }) => {
      const dawarContext = await browser.newContext()
      const dhruvContext = await browser.newContext()
      try {
        const dawar = await dawarContext.newPage()
        await signIn(dawar, live.dawar.email)
        await expect(dawar).toHaveURL(/\/m\/dawar/)
        await dawar
          .getByRole('tablist', { name: 'Team members' })
          .getByRole('tab', { name: 'Dhruv' })
          .click()
        await expect(dawar.getByTestId('sheet-grid').getByText('Kiran Sethi')).toBeVisible()

        const dhruv = await dhruvContext.newPage()
        await signIn(dhruv, live.dhruv.email)
        await expect(dhruv).toHaveURL(/\/m\/dhruv/)
        await dhruv.getByTestId('sheet-grid').focus()
        await dhruv.keyboard.press('n')
        await expect(dhruv.getByTestId('cell-editor')).toBeVisible()
        await dhruv.keyboard.type('Meera Live')
        await dhruv.keyboard.press('Enter')
        await expect(dhruv.getByTestId('sheet-grid').getByText('Meera Live')).toBeVisible()

        // No reload on Dawar's side: Realtime brings it.
        await expect(dawar.getByTestId('sheet-grid').getByText('Meera Live')).toBeVisible({
          timeout: 15_000,
        })
      } finally {
        await dawarContext.close()
        await dhruvContext.close()
      }
    })

    test('sign out returns to the sign-in screen', async ({ page }) => {
      await signIn(page, live.dhruv.email)
      await expect(page).toHaveURL(/\/m\/dhruv/)
      await page.getByRole('button', { name: 'More' }).click()
      await page.getByRole('menuitem', { name: 'Sign out' }).click()
      await expect(page.getByTestId('sign-in')).toBeVisible()
    })
  })
