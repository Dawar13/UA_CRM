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
    expect(svg.toUpperCase()).toContain('#1CA6EF')
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

  test('the soft gradient strip sits at the very top', async ({ page }) => {
    await gotoApp(page, '/', { waitForReady: true })
    const strip = page.locator('#root > div > div').first()
    const box = await strip.boundingBox()
    expect(box?.y).toBe(0)
    expect(box?.height).toBe(3)
    const background = await strip.evaluate((el) => getComputedStyle(el).backgroundImage)
    expect(background).toContain('linear-gradient')
  })
})
