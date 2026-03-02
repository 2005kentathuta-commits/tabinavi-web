#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.error('playwright が見つかりません。`npm i -D playwright` を実行してください。');
    process.exit(1);
  }
}

async function ensureWorkspace(page) {
  await page.waitForSelector('text=あなたの旅行');
  await page
    .waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const targets = buttons.filter((node) =>
        /サンプル旅行を読み込む|旅行を作成/.test(String(node.textContent || '')),
      );
      return targets.some((node) => !node.disabled);
    }, { timeout: 60000 })
    .catch(() => {});

  const itineraryHeading = page.locator('h2:has-text("旅程を編集")');
  const demoButton = page.getByRole('button', { name: 'サンプル旅行を読み込む' });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await itineraryHeading.count()) {
      return;
    }
    if (await demoButton.count()) {
      const buttonHandle = await demoButton.elementHandle();
      if (buttonHandle) {
        await page.waitForFunction((el) => !el.disabled, buttonHandle, { timeout: 20000 }).catch(() => {});
      }
      if (await demoButton.isEnabled().catch(() => false)) {
        await demoButton.click();
        await page.waitForTimeout(1200 + attempt * 350);
      } else {
        await page.waitForTimeout(1000 + attempt * 300);
      }
    }
    const firstTrip = page.locator('.trip-list button').first();
    if (await firstTrip.count()) {
      await firstTrip.click();
      await page.waitForTimeout(900);
      if (await itineraryHeading.count()) {
        return;
      }
    }
  }

  await page.waitForSelector('h2:has-text("旅程を編集")');
}

async function collectTabMetrics(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      if (!el) {
        return false;
      }
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const escape = (value = '') =>
      String(value)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);

    const selectorFor = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const className =
        typeof el.className === 'string' && el.className.trim()
          ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : '';
      return `${el.tagName.toLowerCase()}${id}${className}`;
    };

    const doc = document.documentElement;
    const innerWidth = window.innerWidth;
    const overflowPx = Math.max(0, Math.ceil(doc.scrollWidth - innerWidth));

    const overflowSamples = [];
    const candidates = Array.from(document.querySelectorAll('.content-panel *'));
    for (const node of candidates) {
      if (!visible(node)) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.right > innerWidth + 0.5) {
        overflowSamples.push({
          selector: selectorFor(node),
          right: Math.round(rect.right),
          innerWidth,
          text: escape(node.textContent || ''),
        });
      }
      if (overflowSamples.length >= 5) {
        break;
      }
    }

    const controls = Array.from(
      document.querySelectorAll('.content-panel button, .content-panel input, .content-panel select, .content-panel textarea'),
    ).filter((node) => visible(node));
    const tapTooSmall = controls
      .map((node) => ({
        selector: selectorFor(node),
        w: Math.round(node.getBoundingClientRect().width),
        h: Math.round(node.getBoundingClientRect().height),
        text: escape(node.textContent || node.getAttribute('placeholder') || ''),
      }))
      .filter((entry) => entry.h < 44)
      .slice(0, 8);

    return {
      innerWidth,
      scrollWidth: doc.scrollWidth,
      overflowPx,
      overflowSamples,
      tapTooSmallCount: tapTooSmall.length,
      tapTooSmall,
    };
  });
}

async function main() {
  const { chromium } = await loadPlaywright();
  const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
  const widths = [390, 430, 768, 1024, 1440];
  const tabs = [
    { key: 'itinerary', label: '計画', waitFor: 'h2:has-text("旅程を編集")' },
    { key: 'guide', label: 'しおり', waitFor: 'h2:has-text("しおりを編集")' },
    { key: 'design', label: 'デザイン', waitFor: 'h2:has-text("表紙・テーマをデコレーションする")' },
  ];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(120000);

  const outDir = path.resolve(process.cwd(), 'test-results', 'layout-audit');
  await fs.mkdir(outDir, { recursive: true });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '会員登録せずに始める（ゲスト）' }).click();
    await ensureWorkspace(page);

    const results = [];

    for (const width of widths) {
      const height = width <= 430 ? 932 : width <= 768 ? 980 : 900;
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(350);

      const tabResults = [];
      for (const tab of tabs) {
        await page.getByRole('button', { name: tab.label, exact: true }).click();
        await page.waitForSelector(tab.waitFor);
        await page.waitForTimeout(250);

        const metrics = await collectTabMetrics(page);
        const shot = path.join(outDir, `${width}-${tab.key}.png`);
        await page.screenshot({ path: shot, fullPage: true });

        tabResults.push({
          tab: tab.key,
          screenshot: shot,
          ...metrics,
          pass:
            metrics.overflowPx <= 1 &&
            metrics.overflowSamples.length === 0 &&
            (width > 430 || metrics.tapTooSmallCount === 0),
        });
      }

      results.push({
        width,
        pass: tabResults.every((entry) => entry.pass),
        tabs: tabResults,
      });
    }

    const summary = {
      ok: true,
      baseUrl,
      overallPass: results.every((entry) => entry.pass),
      widths: results,
    };

    const summaryPath = path.join(outDir, 'summary.json');
    await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ...summary, summaryPath }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
