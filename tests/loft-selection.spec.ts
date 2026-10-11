import { expect, test } from '@playwright/test';

// Only this test harness controls dispatch; the application worker protocol is unchanged.
declare global {
    interface Window {
        __loftSelectionTest: {
            builds: number;
            hold: boolean;
            fail: boolean;
            pending: (() => void)[];
            flush: () => void;
        };
    }
}

const config = {
    type: 'circular-loft',
    parameters: {
        sections: [
            {
                circles: [
                    { diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                    { diameterMm: 0, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                ],
            },
            {
                circles: [
                    { diameterMm: 60, offsetDistanceMm: 4, offsetAngleDeg: 90 },
                    { diameterMm: 30, offsetDistanceMm: 4, offsetAngleDeg: 90 },
                ],
            },
            {
                circles: [
                    { diameterMm: 40, offsetDistanceMm: 4, offsetAngleDeg: 90 },
                    { diameterMm: 0, offsetDistanceMm: 4, offsetAngleDeg: 90 },
                ],
            },
            {
                circles: [
                    { diameterMm: 40, offsetDistanceMm: 8, offsetAngleDeg: 90 },
                    { diameterMm: 20, offsetDistanceMm: 8, offsetAngleDeg: 90 },
                ],
            },
        ],
        gapsMm: [20, 0, 30],
    },
};

test.beforeEach(async ({ page }) => {
    await page.addInitScript((initialConfig) => {
        if (!localStorage.getItem('drawer-generator:session')) {
            localStorage.setItem(
                'drawer-generator:session',
                JSON.stringify({ config: initialConfig, highFidelityPreview: false }),
            );
        }
        const state = (window.__loftSelectionTest = {
            builds: 0,
            hold: false,
            fail: false,
            pending: [] as (() => void)[],
            flush: () => {
                state.pending.splice(0).forEach((send) => send());
            },
        });
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
                const send = () => {
                    if (Array.isArray(options)) super.postMessage(message, options);
                    else super.postMessage(message, options);
                };
                if (
                    message &&
                    typeof message === 'object' &&
                    'kind' in message &&
                    message.kind === 'build' &&
                    'jobId' in message
                ) {
                    state.builds++;
                    if (state.hold) {
                        state.pending.push(send);
                        return;
                    }
                    if (state.fail) {
                        window.setTimeout(
                            () =>
                                this.dispatchEvent(
                                    new MessageEvent('message', {
                                        data: {
                                            kind: 'failed',
                                            requestKind: 'build',
                                            jobId: message.jobId,
                                            message: 'Injected preview failure',
                                        },
                                    }),
                                ),
                            0,
                        );
                        return;
                    }
                }
                send();
            }
        };
    }, config);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });
});

for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
]) {
    test(`selects and brightens incoming loft spans at ${viewport.width}×${viewport.height}`, async ({
        page,
    }, testInfo) => {
        await page.setViewportSize(viewport);
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
            if (message.type() === 'error') errors.push(message.text());
        });
        const sections = page.locator('section.loft-section');
        const active = page.getByRole('status').filter({ hasText: /^Active section/ });
        const focused = page.getByRole('status').filter({ hasText: /^Highlighted section/ });
        await expect(sections.filter({ has: page.locator('[aria-pressed="true"]') })).toHaveCount(
            0,
        );
        const builds = await page.evaluate(() => window.__loftSelectionTest.builds);
        await page.getByRole('button', { name: 'Select section 2', exact: true }).click();
        await expect(sections.nth(1)).toHaveAttribute('data-active', 'true');
        await expect(
            page.getByRole('button', { name: 'Select section 2', exact: true }),
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(active).toHaveText('Active section 2: incoming span highlighted.');
        await expect(active).toHaveAttribute('data-lower-z', '0');
        await expect(active).toHaveAttribute('data-upper-z', '20');
        await sections.nth(1).scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath('active-incoming-span.png') });

        await page.getByLabel('Section 4 material boundary 1 diameter').focus();
        await expect(sections.nth(3)).toHaveAttribute('data-active', 'true');
        await expect(focused).toContainText('Highlighted section 4');
        await page.getByLabel('Section 4 material boundary 1 diameter').blur();
        await expect(focused).toHaveCount(0);
        await expect(active).toHaveText('Active section 4: incoming span highlighted.');
        await expect(active).toHaveAttribute('data-lower-z', '20');
        await expect(active).toHaveAttribute('data-upper-z', '50');
        await page.getByRole('button', { name: 'Select section 4', exact: true }).click();
        await expect(sections.locator('.loft-section__select[aria-pressed="true"]')).toHaveCount(1);
        await page.screenshot({ path: testInfo.outputPath('active-upper-span.png') });

        await sections.nth(2).locator('legend').first().click();
        await expect(active).toHaveText('Active section 3: section contours highlighted.');
        await expect(active).not.toHaveAttribute('data-lower-z');
        await page.screenshot({ path: testInfo.outputPath('active-zero-gap-contours.png') });
        await page.getByRole('button', { name: 'Select section 1', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(active).toHaveText('Active section 1: section contours highlighted.');
        await page.screenshot({ path: testInfo.outputPath('active-first-section-contours.png') });
        await page.waitForTimeout(350);
        expect(await page.evaluate(() => window.__loftSelectionTest.builds)).toBe(builds);
        expect(errors).toEqual([]);

        await page.getByRole('button', { name: 'Insert section between 1 and 2' }).click();
        await expect(sections.locator('.loft-section__select[aria-pressed="true"]')).toHaveCount(0);
        await expect(active).toHaveCount(0);
        await page.getByRole('button', { name: 'Select section 2', exact: true }).click();
        await page.reload();
        await expect(sections.locator('.loft-section__select[aria-pressed="true"]')).toHaveCount(0);
        await expect(active).toHaveCount(0);
        await page.getByRole('button', { name: 'Select section 2', exact: true }).click();
        await page.getByRole('button', { name: 'Drawer', exact: true }).click();
        await expect(active).toHaveCount(0);
        await page.getByRole('button', { name: 'Фигура по сечениям', exact: true }).click();
        await expect(sections.locator('.loft-section__select[aria-pressed="true"]')).toHaveCount(0);
    });
}

test('keeps selection aligned with the successful preview during invalid, pending, and failed builds', async ({
    page,
}) => {
    const active = page.getByRole('status').filter({ hasText: /^Active section/ });
    await page.getByRole('button', { name: 'Select section 4', exact: true }).click();
    await expect(active).toHaveAttribute('data-lower-z', '20');
    await expect(active).toHaveAttribute('data-upper-z', '50');
    const gap = page.getByLabel('Distance to section 2', { exact: true });
    const initialBuilds = await page.evaluate(() => window.__loftSelectionTest.builds);
    await gap.fill('');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeDisabled();
    await expect(active).toHaveAttribute('data-upper-z', '50');
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => window.__loftSelectionTest.builds)).toBe(initialBuilds);

    await page.evaluate(() => {
        window.__loftSelectionTest.hold = true;
    });
    await gap.fill('40');
    await expect.poll(() => page.evaluate(() => window.__loftSelectionTest.pending.length)).toBe(1);
    await gap.fill('50');
    await expect.poll(() => page.evaluate(() => window.__loftSelectionTest.pending.length)).toBe(2);
    await expect(active).toHaveAttribute('data-lower-z', '20');
    await expect(active).toHaveAttribute('data-upper-z', '50');
    await page.evaluate(() => {
        window.__loftSelectionTest.hold = false;
        window.__loftSelectionTest.flush();
    });
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });
    await expect(active).toHaveAttribute('data-lower-z', '50');
    await expect(active).toHaveAttribute('data-upper-z', '80');

    await page.evaluate(() => {
        window.__loftSelectionTest.fail = true;
    });
    await page.getByLabel('Distance to section 4', { exact: true }).fill('31');
    await expect(
        page.getByRole('alert').filter({ hasText: 'Injected preview failure' }),
    ).toBeVisible();
    await expect(active).toHaveAttribute('data-upper-z', '80');
    await page.evaluate(() => {
        window.__loftSelectionTest.fail = false;
    });
    await page.getByLabel('Distance to section 4', { exact: true }).fill('32');
    await expect(page.getByRole('button', { name: 'Export STL' })).toBeEnabled({ timeout: 30_000 });
    await expect(active).toHaveAttribute('data-upper-z', '82');
});
