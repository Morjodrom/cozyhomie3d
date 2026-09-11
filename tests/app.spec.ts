import { expect, test } from '@playwright/test'

test('generates, restores, and exports a drawer', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/triangles/)).toBeVisible()

  await page.getByRole('button', { name: 'Drawer' }).click()
  await expect(page.getByRole('heading', { name: 'Open drawer' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Apply texture to' })).toBeVisible()
  await expect(page.getByLabel('Front', { exact: true })).toBeChecked()
  await expect(page.getByLabel('Sides', { exact: true })).toBeChecked()
  await expect(page.getByLabel('Back', { exact: true })).toBeChecked()
  await page.getByLabel('Sides', { exact: true }).uncheck()
  await page.getByLabel('Front', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'High fidelity' }).click()
  await page.locator('input[name="parameters.heightMm"]').fill('60')
  await expect(page.getByText(/× 60\.0 mm/)).toBeVisible()
  await page.waitForTimeout(400)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Drawer' })).toHaveClass(/is-selected/)
  await expect(page.locator('input[name="parameters.heightMm"]')).toHaveValue('60')
  await expect(page.getByLabel('Sides', { exact: true })).not.toBeChecked()
  await expect(page.getByLabel('Front', { exact: true })).not.toBeChecked()
  await expect(page.getByLabel('Back', { exact: true })).toBeChecked()
  await expect(page.getByRole('button', { name: 'High fidelity on' })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export STL' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('drawer-120x60mm.stl')
})

test('inherits pot settings, restores tray controls, and exports both printable parts', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.getByText(/triangles/)).toBeVisible()
  await page.locator('input[name="parameters.topDiameterMm"]').fill('130')
  await page.getByRole('combobox', { name: 'Preset' }).selectOption('smooth')

  await page.getByRole('button', { name: 'Pot + tray' }).click()

  await expect(page.getByRole('heading', { name: 'Planter pot with tray' })).toBeVisible()
  await expect(page.locator('input[name="parameters.topDiameterMm"]')).toHaveValue('130')
  await expect(page.getByLabel('Tray height')).toHaveValue('18')
  await expect(page.getByLabel('Tray wall thickness')).toHaveValue('2')
  await expect(page.getByLabel('Tray bottom thickness')).toHaveValue('3')
  await expect(page.getByLabel('Engagement width')).toHaveValue('2')
  await expect(page.getByLabel('Engagement depth')).toHaveValue('1.5')
  await expect(page.getByLabel('Fit clearance')).toHaveValue('0.25')
  await expect(page.getByLabel('Preview gap')).toHaveValue('12')
  await page.getByLabel('Tray height').fill('22')
  await page.getByLabel('Engagement width').fill('1.5')
  await page.getByLabel('Preview gap').fill('0')
  await page.waitForTimeout(400)
  await page.reload()

  await expect(page.getByRole('button', { name: 'Pot + tray' })).toHaveClass(/is-selected/)
  await expect(page.getByLabel('Tray height')).toHaveValue('22')
  await expect(page.getByLabel('Engagement width')).toHaveValue('1.5')
  await expect(page.getByLabel('Preview gap')).toHaveValue('0')
  await expect(page.getByText(/× 122\.0 mm/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled()

  const filenames: string[] = []
  page.on('download', (download) => filenames.push(download.suggestedFilename()))
  await page.getByRole('button', { name: 'Export STL' }).click()
  await expect.poll(() => filenames, { timeout: 30_000 }).toHaveLength(2)
  expect(filenames.sort()).toEqual(['pot-130x100mm.stl', 'tray-100x22mm.stl'])
})

test('keeps a fully recessed pot and tray connected in the preview', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Preset' }).selectOption('voronoi')
  await page.getByLabel('Average cell size').fill('12')
  await page.getByLabel('Bottom offset').fill('0')
  await page.getByLabel('Top offset').fill('0')
  await page.getByLabel('Bottom fade').fill('0')
  await page.getByLabel('Top fade').fill('0')
  await page.getByRole('combobox', { name: 'Relief mode' }).selectOption('recess')
  await page.getByRole('button', { name: 'Pot + tray' }).click()

  await expect(page.getByText(/triangles/)).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('blocks export when valid fields produce an unsafe drainage layout', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Pot', exact: true }).click()
  await expect(page.getByText(/triangles/)).toBeVisible()

  await page.locator('input[name="parameters.bottomDiameterMm"]').fill('30')
  await page.locator('input[name="parameters.topDiameterMm"]').fill('30')
  await page.locator('input[name="drainage.count"]').fill('12')
  await page.locator('input[name="drainage.diameterMm"]').fill('8')

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

test('renders cell textures on both model types without worker errors', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await expect(page.getByText(/triangles/)).toBeVisible()
  const exportButton = page.getByRole('button', { name: 'Export STL' })
  const waitForWorker = async () => {
    await expect(exportButton).toBeDisabled({ timeout: 5_000 })
    await expect(exportButton).toBeEnabled({ timeout: 30_000 })
  }
  for (const kind of ['honeycomb', 'voronoi']) {
    await page.getByRole('button', { name: 'Pot', exact: true }).click()
    await page.getByRole('combobox', { name: 'Preset' }).selectOption(kind)
    await waitForWorker()

    await page.getByRole('button', { name: 'Drawer' }).click()
    await waitForWorker()
  }
  await expect(page.getByText(/triangles/)).toBeVisible()
  expect(errors).toEqual([])
})

test('configures and persists a reinforced drawer opening', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Drawer' }).click()

  await page.getByLabel('Handle style').selectOption('recessed')
  await page.getByLabel('Handle width').fill('45')
  await page.getByLabel('Handle height').fill('14')
  await page.getByLabel('Rib depth').fill('10')
  await page.getByLabel('Corner radius').fill('4')
  await page.getByLabel('Vertical position').fill('65')

  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled()
  await page.waitForTimeout(400)
  await page.reload()

  await expect(page.getByLabel('Handle style')).toHaveValue('recessed')
  await expect(page.getByLabel('Handle width')).toHaveValue('45')
  await expect(page.getByLabel('Handle height')).toHaveValue('14')
  await expect(page.getByLabel('Rib depth')).toHaveValue('10')
  await expect(page.getByLabel('Corner radius')).toHaveValue('4')
  await expect(page.getByLabel('Vertical position')).toHaveValue('65')
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled()
})

test('configures and persists independent bottom rib patterns', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Concentric ribs')).toHaveValue('3')
  await page.getByLabel('Groove depth').fill('1.5')
  await page.getByLabel('Groove width').fill('4')
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled()

  await page.getByRole('button', { name: 'Drawer' }).click()
  await page.getByLabel('Ribs parallel to X').fill('2')
  await page.getByLabel('Ribs parallel to Y').fill('0')
  await page.getByLabel('Groove depth').fill('1.25')
  await page.waitForTimeout(400)
  await page.reload()

  await expect(page.getByRole('button', { name: 'Drawer' })).toHaveClass(/is-selected/)
  await expect(page.getByLabel('Ribs parallel to X')).toHaveValue('2')
  await expect(page.getByLabel('Ribs parallel to Y')).toHaveValue('0')
  await expect(page.getByLabel('Groove depth')).toHaveValue('1.25')
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled()
})

test('configures and persists rigidity-rib placement and counts', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 })
  const potRibs = page.locator('section.control-group').filter({ has: page.getByRole('heading', { name: 'Rigidity ribs' }) })
  await expect(potRibs.getByLabel('Placement')).toHaveValue('inside')
  await potRibs.getByLabel('Placement').selectOption('outside')
  await potRibs.getByLabel('Projection').fill('1.5')
  await potRibs.getByLabel('Base width').fill('3')
  await potRibs.getByLabel('Hoop count').fill('3')
  await page.waitForTimeout(400)
  await page.reload()

  const restoredPotRibs = page.locator('section.control-group').filter({ has: page.getByRole('heading', { name: 'Rigidity ribs' }) })
  await expect(restoredPotRibs.getByLabel('Placement')).toHaveValue('outside')
  await expect(restoredPotRibs.getByLabel('Hoop count')).toHaveValue('3')

  await page.getByRole('button', { name: 'Drawer' }).click()
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 })
  const drawerRibs = page.locator('section.control-group').filter({ has: page.getByRole('heading', { name: 'Rigidity ribs' }) })
  await expect(drawerRibs.getByLabel('Placement')).toHaveValue('inside')
  await drawerRibs.getByLabel('Placement').selectOption('outside')
  await drawerRibs.getByLabel('Projection').fill('1.5')
  await drawerRibs.getByLabel('Base width').fill('3')
  await drawerRibs.getByLabel('Front / back count').fill('2')
  await drawerRibs.getByLabel('Side count').fill('1')
  await page.waitForTimeout(400)
  await page.reload()

  const restoredDrawerRibs = page.locator('section.control-group').filter({ has: page.getByRole('heading', { name: 'Rigidity ribs' }) })
  await expect(page.getByRole('button', { name: 'Drawer' })).toHaveClass(/is-selected/)
  await expect(restoredDrawerRibs.getByLabel('Placement')).toHaveValue('outside')
  await expect(restoredDrawerRibs.getByLabel('Front / back count')).toHaveValue('2')
  await expect(restoredDrawerRibs.getByLabel('Side count')).toHaveValue('1')
})

test('shows wall controls only for a textured drawer', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 })
  await expect(page.getByRole('group', { name: 'Apply texture to' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Drawer' }).click()
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 })
  await expect(page.getByRole('group', { name: 'Apply texture to' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Preset' }).selectOption('smooth')
  await expect(page.getByRole('group', { name: 'Apply texture to' })).toHaveCount(0)
})

test('configures and persists structural and drainage edge treatment', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Style')).toHaveValue('rounded')
  await expect(page.getByLabel('Maximum radius')).toHaveValue('1')
  await page.getByLabel('Style').selectOption('chamfered')
  await page.getByLabel('Maximum chamfer width').fill('20')
  await page.getByLabel('Round drainage holes').check()
  await page.getByLabel('Drainage radius').fill('0.8')
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled()
  await page.waitForTimeout(400)
  await page.reload()

  await expect(page.getByLabel('Style')).toHaveValue('chamfered')
  await expect(page.getByLabel('Maximum chamfer width')).toHaveValue('20')
  await expect(page.getByLabel('Round drainage holes')).toBeChecked()
  await expect(page.getByLabel('Drainage radius')).toHaveValue('0.8')
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled()
})

test('configures and persists finite fractal branches across model changes', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await expect(page.getByText(/triangles/)).toBeVisible()

  await page.getByRole('combobox', { name: 'Preset' }).selectOption('fractal')
  await page.getByLabel('Levels').fill('3')
  await page.getByLabel('Branch angle').fill('38')
  await page.getByLabel('Trunk width').fill('2.4')
  await page.getByRole('button', { name: 'Drawer' }).click()
  await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 })
  await page.reload()

  await expect(page.getByRole('combobox', { name: 'Preset' })).toHaveValue('fractal')
  await expect(page.getByLabel('Largest branch length')).toHaveValue('18')
  await expect(page.getByLabel('Levels')).toHaveValue('3')
  await expect(page.getByLabel('Branch angle')).toHaveValue('38')
  await expect(page.getByLabel('Trunk width')).toHaveValue('2.4')
  await expect(page.getByText(/triangles/)).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export STL' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('drawer-120x50mm.stl')
})
