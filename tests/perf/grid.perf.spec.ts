import { expect, gotoApp, test } from '../support/fixtures'

/**
 * Performance smoke on the 2,000-row sheet (CLAUDE.md §3.1: the grid scrolls smoothly at 2,000
 * rows). Runs on the desktop project only.
 */
test.describe('2,000-row sheet', () => {
  test('first rows appear quickly, the last row is reachable and scrolling has no long tasks', async ({
    page,
  }) => {
    await gotoApp(page, '/', { waitForReady: true })
    const path = await page.evaluate(async () => {
      if (!window.__uaTest) throw new Error('Test hooks are off')
      return window.__uaTest.loadPerfSheet()
    })
    expect(path).toBe('/m/dawar/customers-2000')

    // First rows visible within 1.5 s of navigation.
    const started = Date.now()
    await page.goto(path)
    const grid = page.getByRole('grid', { name: 'Customers (2,000)' })
    await expect(grid.locator('[role="row"][data-row-id]').first()).toBeVisible()
    const elapsed = Date.now() - started
    expect(elapsed, `first rows took ${elapsed} ms`).toBeLessThan(1500)
    // The header, 2,000 rows and the "Add a contact" line of your own tab (M1.3).
    await expect(grid).toHaveAttribute('aria-rowcount', '2002')

    // Watch for long tasks while scrolling.
    await page.evaluate(() => {
      const w = window as unknown as { __longTasks: number[] }
      w.__longTasks = []
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.__longTasks.push(entry.duration)
      }).observe({ type: 'longtask', buffered: false })
    })

    await grid.focus()
    await page.keyboard.press('PageDown')
    await page.keyboard.press('PageDown')
    await page.keyboard.press('ControlOrMeta+End')

    // The last row is reachable and rendered.
    const lastRow = grid.locator('[role="row"][aria-rowindex="2001"]')
    await expect(lastRow).toBeVisible()
    await expect(lastRow).toHaveAttribute('aria-selected', 'true')

    // Back to the top, then a mouse-wheel scroll through part of the list.
    await page.keyboard.press('ControlOrMeta+Home')
    await expect(grid.locator('[role="row"][aria-rowindex="2"]')).toBeVisible()
    const box = await grid.boundingBox()
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 1200)
      await page.waitForTimeout(16)
    }

    const longTasks = await page.evaluate(
      () => (window as unknown as { __longTasks: number[] }).__longTasks,
    )
    const over200 = longTasks.filter((d) => d > 200)
    expect(over200, `long tasks over 200 ms: ${over200.join(', ')}`).toEqual([])
  })
})
