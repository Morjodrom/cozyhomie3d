import { expect, test } from '@playwright/test'

test('generates, restores, and exports a drawer', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/triangles/)).toBeVisible()

  await page.getByRole('button', { name: 'Drawer' }).click()
  await expect(page.getByRole('heading', { name: 'Open drawer' })).toBeVisible()
  await page.locator('input[name="parameters.heightMm"]').fill('60')
  await expect(page.getByText(/× 60\.0 mm/)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Drawer' })).toHaveClass(/is-selected/)
  await expect(page.locator('input[name="parameters.heightMm"]')).toHaveValue('60')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export STL' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('drawer-120x60mm.stl')
})

test('blocks export when valid fields produce an unsafe drainage layout', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Pot' }).click()
  await expect(page.getByText(/triangles/)).toBeVisible()

  await page.locator('input[name="parameters.bottomDiameterMm"]').fill('30')
  await page.locator('input[name="parameters.topDiameterMm"]').fill('30')
  await page.locator('input[name="parameters.drainageHoleCount"]').fill('12')
  await page.locator('input[name="parameters.drainageHoleDiameterMm"]').fill('8')

  await expect(page.getByRole('alert')).toContainText('Drainage holes cannot fit')
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeDisabled()
  await expect(page.getByText(/triangles/)).toBeVisible()
})

test('persists a procedural texture across model changes and exports it', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('combobox', { name: 'Preset' }).selectOption('noise')
  await page.getByLabel('Seed').fill('42')
  await expect(page.getByLabel('Seed')).toHaveValue('42')
  await page.getByRole('button', { name: 'Drawer' }).click()
  await expect(page.getByRole('heading', { name: 'Open drawer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled()
  await page.reload()

  await expect(page.getByRole('combobox', { name: 'Preset' })).toHaveValue('noise')
  await expect(page.getByLabel('Seed')).toHaveValue('42')
  await expect(page.getByText(/triangles/)).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export STL' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('drawer-120x50mm.stl')
})

test('ignores the legacy v1 session', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('drawer-generator:session:v1', JSON.stringify({ schemaVersion: 1, type: 'drawer' }))
  })
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Pot' })).toHaveClass(/is-selected/)
  await expect(page.getByRole('combobox', { name: 'Preset' })).toHaveValue('ribs')
})
