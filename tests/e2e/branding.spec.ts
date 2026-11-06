import { expect, gotoApp, test } from '../support/fixtures'

test.describe('branding', () => {
  test('the header shows the brand mark, wordmark and Internal CRM label', {
    tag: '@smoke',
  }, async ({ page }) => {
    await gotoApp(page, '/', { waitForReady: true })

    const header = page.getByRole('banner')
    await expect(header.getByTestId('brand-mark')).toBeVisible()
    await expect(header.getByText('Utopian Autonomy', { exact: true })).toBeVisible()
    await expect(header.getByText('Internal CRM', { exact: true })).toBeVisible()

    // The brand mark is the 28px rounded square from CLAUDE.md §3.4.
    const mark = await header.getByTestId('brand-mark').boundingBox()
    expect(mark?.width).toBe(28)
    expect(mark?.height).toBe(28)
  })

  test('the document title and favicon are right', { tag: '@smoke' }, async ({ page }) => {
    await gotoApp(page, '/', { waitForReady: true })

    await expect(page).toHaveTitle('UA · Internal CRM')

    const icon = page.locator('head link[rel="icon"]')
    await expect(icon).toHaveCount(1)
    // The favicon is the founders' UA mark (D-044), inlined as a 64px PNG the browser can load.
    await expect(icon).toHaveAttribute('type', 'image/png')
    const href = (await icon.getAttribute('href')) ?? ''
    expect(href).toMatch(/^data:image\/png;base64,/)
    const loaded = await page.evaluate(
      (src) =>
        new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
          img.onerror = () => reject(new Error('favicon failed to load'))
          img.src = src
        }),
      href,
    )
    expect(loaded).toEqual({ width: 64, height: 64 })
  })

  // M0.6 dropped the 3px gradient strip: the 56px header sits at the very top. The mark is the
  // founders' logo (D-044), loaded and drawn sharp at 4x.
  test("the 56px header sits at the very top, with the founders' mark", async ({ page }) => {
    await gotoApp(page, '/', { waitForReady: true })
    const header = page.getByRole('banner')
    const box = await header.boundingBox()
    expect(box?.y).toBe(0)
    expect(box?.height).toBe(56)
    const mark = header.getByTestId('brand-mark')
    const image = await mark.evaluate((el) => ({
      complete: (el as HTMLImageElement).complete,
      width: (el as HTMLImageElement).naturalWidth,
    }))
    expect(image).toEqual({ complete: true, width: 112 })
  })
})
