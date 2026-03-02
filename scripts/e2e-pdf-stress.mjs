#!/usr/bin/env node
/* eslint-disable no-console */

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.error('playwright が見つかりません。`npm i -D playwright` を実行してください。');
    process.exit(1);
  }
}

async function main() {
  const { chromium, webkit } = await loadPlaywright();
  const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
  const count = Math.max(1, Math.min(20, Number(process.env.PDF_STRESS_COUNT || 10)));
  const browserName = String(process.env.E2E_BROWSER || 'chromium').toLowerCase();
  const browserType = browserName === 'webkit' ? webkit : chromium;
  if (!browserType) {
    throw new Error(`未対応のE2E_BROWSERです: ${browserName}`);
  }
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(180000);

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__tabinaviPdfDebug?.runStress), null, {
      timeout: 45000,
    });

    const run = async (templateId) =>
      page.evaluate(
        async ({ templateId: targetTemplateId, count: targetCount }) => {
          const hook = window.__tabinaviPdfDebug;
          if (!hook || typeof hook.runStress !== 'function') {
            throw new Error('pdf debug hook is unavailable');
          }
          const result = await hook.runStress({ templateId: targetTemplateId, type: 'both', count: targetCount });
          return result;
        },
        { templateId, count },
      );

    const templateA = await run('templateA');
    const templateB = await run('templateB');

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          browser: browserName,
          count,
          runs: [templateA, templateB],
          checks: ['templateA-guide+memories', 'templateB-guide+memories'],
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
