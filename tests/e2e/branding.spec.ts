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
    await expect(icon).toHaveAttribute('type', 'image/svg+xml')
    const href = (await icon.getAttribute('href')) ?? ''
    expect(href).toMatch(/^data:image\/svg\+xml/)

    // The favicon is the brand mark: an SVG in the vivid UA blue that the browser can load.
    const svg = decodeURIComponent(href.replace(/^data:image\/svg\+xml(;charset=utf-8)?,/i, ''))
    expect(svg).toContain('<svg')
    // The brand mark's sky gradient (M0.6).
    expect(svg.toUpperCase()).toContain('#6CC4F6')
    expect(svg.toUpperCase()).toContain('#1C9BEA')
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
    expect(loaded.width).toBeGreaterThan(0)
    expect(loaded.height).toBeGreaterThan(0)
  })

  // M0.6 dropped the 3px gradient strip: the 56px header now sits at the very top, and the brand
  // mark carries the sky gradient instead.
  test('the 56px header sits at the very top, with the mark in the sky gradient', async ({
    page,
  }) => {
    await gotoApp(page, '/', { waitForReady: true })
    const header = page.getByRole('banner')
    const box = await header.boundingBox()
    expect(box?.y).toBe(0)
    expect(box?.height).toBe(56)
    const mark = header.getByTestId('brand-mark')
    await expect(mark).toHaveText('UA')
    const background = await mark.evaluate((el) => getComputedStyle(el).backgroundImage)
    expect(background).toContain('linear-gradient')
  })
})
