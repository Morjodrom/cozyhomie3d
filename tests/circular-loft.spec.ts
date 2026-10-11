import { expect, test } from '@playwright/test';

test('edits, validates, restores, highlights, and exports a circular loft', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Фигура по сечениям', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Фигура по сечениям' })).toBeVisible();
    await expect(page.getByLabel('Section 1 material boundary 1 diameter')).toHaveValue('60');
    await expect(page.getByLabel('Distance to section 2')).toHaveValue('60');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Add innermost boundary' }).click();
    await expect(page.getByLabel('Section 1 void boundary 1 diameter')).toHaveValue('30');
    await expect(page.getByLabel('Section 2 void boundary 1 diameter')).toHaveValue('30');

    await page.getByRole('button', { name: 'Insert section between 1 and 2' }).click();
    await page.getByRole('button', { name: 'Append section' }).click();
    await expect(page.getByRole('heading', { name: 'Section 4' })).toBeVisible();
    const fourthSection = page
        .locator('section.loft-section')
        .filter({ has: page.getByRole('heading', { name: 'Section 4', exact: true }) });
    await fourthSection.getByRole('button', { name: 'Remove section' }).click();
    await expect(page.getByRole('heading', { name: 'Section 4' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Append section' }).click();
    await expect(page.getByRole('heading', { name: 'Section 4' })).toBeVisible();
    await page.getByLabel('Distance to section 3').fill('0');
    await page.getByLabel('Section 3 material boundary 1 diameter').fill('40');
    await page.getByLabel('Section 4 material boundary 1 diameter').fill('40');
    await expect(page.getByLabel('Distance to section 3')).toHaveValue('0');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });

    const innerDiameter = page.getByLabel('Section 1 void boundary 1 diameter');
    await innerDiameter.fill('60');
    await expect(
        page.getByRole('alert').filter({ hasText: 'fit strictly inside' }).first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeDisabled();
    await expect(page.getByText(/triangles/)).toBeVisible();

    await innerDiameter.fill('30');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });
    await innerDiameter.fill('');
    await expect(
        page.getByRole('status').filter({ hasText: 'Highlighted section 1, void boundary 1' }),
    ).toHaveCount(0);
    await innerDiameter.fill('30');
    await innerDiameter.focus();
    await expect(
        page.getByRole('status').filter({ hasText: 'Highlighted section 1, void boundary 1' }),
    ).toBeVisible();
    await innerDiameter.blur();
    await expect(
        page.getByRole('status').filter({ hasText: 'Highlighted section 1, void boundary 1' }),
    ).toHaveCount(0);

    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Фигура по сечениям' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Section 4' })).toBeVisible();
    await expect(page.getByLabel('Distance to section 3')).toHaveValue('0');
    await expect(page.getByLabel('Section 4 material boundary 1 diameter')).toHaveValue('40');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export STL' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('circular-loft.stl');
    expect(await download.failure()).toBeNull();
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    let size = 0;
    for await (const chunk of stream!) size += chunk.length;
    expect(size).toBeGreaterThan(84);

    await page.getByRole('button', { name: 'Drawer', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Open drawer' })).toBeVisible();
});

test('edits independent centers and keeps invalid step operations as visible drafts', async ({
    page,
}) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Фигура по сечениям', exact: true }).click();
    await page.getByRole('button', { name: 'Add innermost boundary' }).click();
    await page.getByRole('button', { name: 'Add innermost boundary' }).click();
    await expect(page.getByLabel('Section 1 material boundary 2 diameter')).toHaveValue('15');
    await page.getByLabel('Section 1 material boundary 1 offset angle').fill('90');
    await page.getByLabel('Section 1 material boundary 1 offset distance').fill('10');
    await page.getByLabel('Section 1 void boundary 1 offset distance').fill('4');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });
    const offset = page.getByLabel('Section 1 void boundary 1 offset distance');
    await offset.focus();
    await expect(
        page.getByRole('status').filter({ hasText: 'Highlighted section 1, void' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Remove innermost boundary' }).click();
    await expect(page.getByLabel('Section 1 material boundary 2 diameter')).toHaveCount(0);
    await expect(page.getByLabel('Section 2 material boundary 2 diameter')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Highlighted section' })).toHaveCount(
        0,
    );

    await page.getByRole('button', { name: 'Insert section between 1 and 2' }).click();
    await expect(page.getByLabel('Section 2 material boundary 1 offset distance')).toHaveValue('5');
    await expect(page.getByLabel('Section 2 void boundary 1 offset distance')).toHaveValue('2');
    const middleSection = page.locator('section.loft-section').filter({
        has: page.getByRole('heading', { name: 'Section 2', exact: true }),
    });
    await middleSection.getByRole('button', { name: 'Remove section' }).click();
    await expect(page.getByLabel('Distance to section 2')).toHaveValue('60');

    await page.getByLabel('Distance to section 2').fill('0');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeDisabled();
    await expect(page.getByRole('alert').filter({ hasText: 'first gap' }).first()).toBeVisible();
    await page.getByLabel('Distance to section 2').fill('60');
    await page.getByRole('button', { name: 'Append section' }).click();
    await page.getByRole('button', { name: 'Append section' }).click();
    await page.getByLabel('Distance to section 3').fill('0');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Insert section between 2 and 3' }).click();
    await expect(page.getByLabel('Distance to section 3')).toHaveValue('0');
    await expect(page.getByLabel('Distance to section 4')).toHaveValue('0');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeDisabled();
    await expect(
        page.getByRole('alert').filter({ hasText: 'cannot be consecutive' }).first(),
    ).toBeVisible();
});

test('places transitions between sections and accepts zero-diameter deepest voids', async ({
    page,
}) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Фигура по сечениям', exact: true }).click();
    const transition = page.getByRole('region', { name: 'Transition from section 1 to 2' });
    await expect(transition).toBeVisible();
    expect(
        await transition.evaluate((element) => [
            element.previousElementSibling?.querySelector('h3')?.textContent,
            element.nextElementSibling?.querySelector('h3')?.textContent,
        ]),
    ).toEqual(['Section 1', 'Section 2']);
    await expect(transition.getByLabel('Distance to section 2')).toHaveValue('60');

    await page.getByRole('button', { name: 'Add innermost boundary' }).click();
    const lowerVoid = page.getByLabel('Section 1 void boundary 1 diameter');
    await lowerVoid.fill('0');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });
    await expect(
        page.getByRole('status').filter({ hasText: 'Highlighted section 1, void boundary 1' }),
    ).toBeVisible();
    await page.getByLabel('Section 2 void boundary 1 diameter').fill('0');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });

    const outer = page.getByLabel('Section 1 material boundary 1 diameter');
    await outer.fill('0');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeDisabled();
    await outer.fill('60');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByLabel('Section 1 void boundary 1 diameter')).toHaveValue('0');
    await expect(page.getByLabel('Section 2 void boundary 1 diameter')).toHaveValue('0');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export STL' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('circular-loft.stl');
    expect(await download.failure()).toBeNull();

    await page.getByRole('button', { name: 'Insert section between 1 and 2' }).click();
    const secondTransition = page.getByRole('region', { name: 'Transition from section 2 to 3' });
    expect(
        await secondTransition.evaluate((element) => [
            element.previousElementSibling?.querySelector('h3')?.textContent,
            element.nextElementSibling?.querySelector('h3')?.textContent,
        ]),
    ).toEqual(['Section 2', 'Section 3']);
});

for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
]) {
    test(`shows compact loft fields and per-kind numbering at ${viewport.width}×${viewport.height}`, async ({
        page,
    }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.goto('/');
        await page.getByRole('button', { name: 'Фигура по сечениям', exact: true }).click();
        for (let boundary = 1; boundary < 4; boundary++) {
            await page.getByRole('button', { name: 'Add innermost boundary' }).click();
        }

        const sections = page.locator('section.loft-section');
        for (const section of await sections.all()) {
            await expect(section.locator('legend')).toHaveText([
                'Material boundary 1',
                'Void boundary 1',
                'Material boundary 2',
                'Void boundary 2',
            ]);
            const boundary = section.locator('.loft-boundary').first();
            await expect(
                boundary.locator('label .numeric-field__label > span:first-child'),
            ).toHaveText(['Diameter', 'Offset', 'Angle']);
            const inputs = await boundary.locator('input').all();
            const boxes = await Promise.all(inputs.map((input) => input.boundingBox()));
            expect(boxes.every((box) => box !== null && box.y === boxes[0]!.y)).toBe(true);
        }

        const deepestVoid = page.getByLabel('Section 1 void boundary 2 diameter', { exact: true });
        await deepestVoid.focus();
        await page.keyboard.press('Tab');
        await expect(
            page.getByLabel('Section 1 void boundary 2 offset distance', { exact: true }),
        ).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(deepestVoid).toBeFocused();
        await expect(
            page.getByRole('status').filter({ hasText: 'Highlighted section 1, void boundary 2' }),
        ).toBeVisible();
        await sections.first().locator('.loft-boundary').last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath('compact-loft-focus.png') });

        await deepestVoid.fill('0');
        await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({
            timeout: 30_000,
        });
        await expect(
            page.getByRole('status').filter({ hasText: 'Highlighted section 1, void boundary 2' }),
        ).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('contrasting-loft-tip.png') });
        await deepestVoid.fill('7.5');

        await deepestVoid.fill('');
        await expect(page.getByRole('button', { name: 'Export STL' })).toBeDisabled();
        await expect(deepestVoid).toHaveAttribute('aria-invalid', 'true');
        await sections.first().locator('.loft-boundary').last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath('compact-loft-error.png') });
        await deepestVoid.fill('7.5');
        await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({
            timeout: 30_000,
        });
        await page.getByRole('button', { name: 'Remove innermost boundary' }).click();
        await expect(
            page.getByLabel('Section 1 void boundary 2 diameter', { exact: true }),
        ).toHaveCount(0);
        await page.getByRole('button', { name: 'Add innermost boundary' }).click();
        await expect(
            page.getByLabel('Section 1 void boundary 2 diameter', { exact: true }),
        ).toHaveValue('7.5');

        const transition = page.getByRole('region', { name: 'Transition from section 1 to 2' });
        await expect(
            transition.locator('label .numeric-field__label > span:first-child'),
        ).toHaveText('Distance');
        await expect(
            transition.getByRole('button', { name: 'Insert section between 1 and 2' }),
        ).toHaveText('Insert section');
        await expect(transition).toHaveCSS('background-color', 'rgb(255, 242, 207)');
        await transition.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath('compact-loft-transition.png') });
        await transition.getByRole('button', { name: 'Insert section between 1 and 2' }).click();
        await expect(sections).toHaveCount(3);
        await expect(sections.nth(1).locator('legend')).toHaveText([
            'Material boundary 1',
            'Void boundary 1',
            'Material boundary 2',
            'Void boundary 2',
        ]);
    });
}

test('retains angle at zero offset, validates drafts, and restores polar state', async ({
    page,
}) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Фигура по сечениям', exact: true }).click();
    const distance = page.getByLabel('Section 1 material boundary 1 offset distance', {
        exact: true,
    });
    const angle = page.getByLabel('Section 1 material boundary 1 offset angle', { exact: true });
    await expect(page.getByLabel('Section 1 material boundary 1 X offset')).toHaveCount(0);
    await expect(distance).toHaveValue('0');
    await angle.fill('-810');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });
    await angle.focus();
    await expect(
        page.getByRole('status').filter({ hasText: 'Highlighted section 1, material boundary 1' }),
    ).toBeVisible();
    await angle.fill('');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: 'Highlighted section' })).toHaveCount(
        0,
    );
    await angle.fill('-810');
    await distance.fill('-1');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeDisabled();
    await expect(distance).toHaveAttribute('aria-invalid', 'true');
    await distance.fill('0');
    await expect(angle).toHaveValue('-810');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });
    await page.reload();
    await expect(distance).toHaveValue('0');
    await expect(angle).toHaveValue('-810');
    await distance.fill('10');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });
    await angle.blur();
    await distance.blur();
    await expect(page.getByRole('status').filter({ hasText: 'Highlighted section' })).toHaveCount(
        0,
    );
    await page.getByRole('button', { name: 'Drawer', exact: true }).click();
    await page.getByRole('button', { name: 'Фигура по сечениям', exact: true }).click();
    await expect(distance).toHaveValue('0');
    await expect(angle).toHaveValue('0');
});

test('migrates a legacy XY session and exports the restored loft', async ({ page }) => {
    await page.addInitScript(() => {
        if (localStorage.getItem('drawer-generator:session')) return;
        localStorage.setItem(
            'drawer-generator:session',
            JSON.stringify({
                config: {
                    type: 'circular-loft',
                    parameters: {
                        sections: [
                            {
                                circles: [
                                    { diameterMm: 60, xMm: 10, yMm: 0 },
                                    { diameterMm: 0, xMm: 10, yMm: 5 },
                                ],
                            },
                            {
                                circles: [
                                    { diameterMm: 60, xMm: 10, yMm: 0 },
                                    { diameterMm: 30, xMm: 10, yMm: 5 },
                                ],
                            },
                        ],
                        gapsMm: [60],
                    },
                },
                highFidelityPreview: true,
            }),
        );
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Фигура по сечениям' })).toBeVisible();
    await expect(page.getByLabel('Section 1 material boundary 1 offset distance')).toHaveValue(
        '10',
    );
    await expect(page.getByLabel('Section 1 material boundary 1 offset angle')).toHaveValue('90');
    await expect(page.getByLabel('Section 1 void boundary 1 diameter')).toHaveValue('0');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem('drawer-generator:session')))
        .toContain('offsetDistanceMm');
    expect(
        await page.evaluate(() => localStorage.getItem('drawer-generator:session')),
    ).not.toContain('xMm');
    await page.reload();
    await expect(page.getByLabel('Section 1 material boundary 1 offset angle')).toHaveValue('90');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export STL' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('circular-loft.stl');
    expect(await download.failure()).toBeNull();
});
