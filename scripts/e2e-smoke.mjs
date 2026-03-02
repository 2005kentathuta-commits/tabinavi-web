#!/usr/bin/env node
/* eslint-disable no-console */

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error(
      'playwright が見つかりません。`npm i -D playwright` を実行してから再実行してください。',
    );
    process.exit(1);
  }

  const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(120000);

  const ensureWorkspace = async () => {
    await page.waitForSelector('text=あなたの旅行');
    const itineraryHeading = page.locator('h2:has-text("旅程を編集")');
    const demoButton = page.getByRole('button', { name: 'サンプル旅行を読み込む' });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (await itineraryHeading.count()) {
        return;
      }
      if (await demoButton.count()) {
        const handle = await demoButton.elementHandle();
        if (handle) {
          await page.waitForFunction((el) => !el.disabled, handle, { timeout: 20000 }).catch(() => {});
        }
        if (await demoButton.isEnabled().catch(() => false)) {
          await demoButton.click();
          await page.waitForTimeout(1200 + attempt * 250);
        }
      }
      const firstTrip = page.locator('.trip-list button').first();
      if (await firstTrip.count()) {
        await firstTrip.click();
        await page.waitForTimeout(900);
      }
    }

    await page.waitForSelector('h2:has-text("旅程を編集")');
  };

  const createTripAndOpen = async () => {
    const tripName = `監査-${Date.now()}`;
    await page.getByLabel('旅行名').fill(tripName);
    await page.getByLabel('目的地').fill('東京');
    await page.getByRole('button', { name: '旅行を作成' }).click();
    await page.waitForSelector('h2:has-text("旅程を編集")');
    await page.waitForFunction(
      (expected) => {
        const title = document.querySelector('.decor-overlay h2');
        return title && String(title.textContent || '').includes(expected);
      },
      tripName,
      { timeout: 60000 },
    );
    return tripName;
  };

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    const guestStartButton = page.getByRole('button', { name: '会員登録せずに始める（ゲスト）' });
    if (!(await guestStartButton.count())) {
      throw new Error('ゲスト開始ボタンが見つかりません。認証画面を確認してください。');
    }
    await guestStartButton.click();

    const createdTripName = await createTripAndOpen();
    await ensureWorkspace();

    await page.getByRole('button', { name: 'しおり', exact: true }).click();
    await page.waitForSelector('h2:has-text("しおりを編集")');

    await page.getByRole('button', { name: 'デザイン', exact: true }).click();
    await page.waitForSelector('h2:has-text("表紙・テーマをデコレーションする")');

    await page.getByRole('button', { name: 'しおりPDF' }).first().click();
    await page.waitForSelector('text=しおりPDFの生成を開始しました。', { timeout: 60000 });

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          createdTripName,
          flow: ['guest-login', 'create-trip', 'open-guide', 'open-design', 'pdf-trigger'],
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
  console.error(error?.message || String(error));
  process.exit(1);
});
