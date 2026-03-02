#!/usr/bin/env node
/* eslint-disable no-console */

async function main() {
  let chromium;
  let webkit;
  try {
    ({ chromium, webkit } = await import('playwright'));
  } catch {
    console.error(
      'playwright が見つかりません。`npm i -D playwright` を実行してから再実行してください。',
    );
    process.exit(1);
  }

  const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
  const browserName = String(process.env.E2E_BROWSER || 'chromium').toLowerCase();
  const browserType = browserName === 'webkit' ? webkit : chromium;
  if (!browserType) {
    throw new Error(`未対応のE2E_BROWSERです: ${browserName}`);
  }
  const browser = await browserType.launch({ headless: true });
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

  const runQuickItineraryAdd = async () => {
    await page.getByRole('button', { name: '計画', exact: true }).click();
    await page.waitForSelector('h2:has-text("旅程を編集")');
    const quickAddButton = page.getByRole('button', { name: /選択中を追加/ }).first();
    if (!(await quickAddButton.count())) {
      throw new Error('計画タブの1クリック追加ボタンが見つかりません。');
    }
    await quickAddButton.click();
    await page.waitForSelector('text=1クリックで', { timeout: 60000 });
  };

  const createTripAndOpen = async () => {
    const tripName = `監査-${Date.now()}`;
    await page.waitForSelector('text=あなたの旅行');
    const createForm = page.locator('aside.side-panel form').first();
    await createForm.waitFor({ state: 'visible' });
    await createForm.locator('input').nth(0).fill(tripName);
    await createForm.locator('input').nth(1).fill('東京');
    await createForm.getByRole('button', { name: '旅行を作成' }).click();
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

  const openSampleTripOrCreate = async () => {
    await page.waitForSelector('text=あなたの旅行');
    const itineraryHeading = page.locator('h2:has-text("旅程を編集")');
    const demoButton = page.getByRole('button', { name: 'サンプル旅行を読み込む' });
    const firstTrip = page.locator('.trip-list button').first();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (await itineraryHeading.count()) {
        break;
      }
      if (await demoButton.count() && (await demoButton.isEnabled().catch(() => false))) {
        await demoButton.click();
        await page.waitForTimeout(1300 + attempt * 300);
      }
      if (await itineraryHeading.count()) {
        break;
      }
      if (await firstTrip.count()) {
        await firstTrip.click();
        await page.waitForTimeout(900);
      }
    }

    if (await itineraryHeading.count()) {
      const title = await page.locator('.trip-head h1').first().textContent().catch(() => '');
      return {
        mode: 'sample',
        tripName: String(title || '').trim() || 'sample-trip',
      };
    }

    const created = await createTripAndOpen();
    return {
      mode: 'create',
      tripName: created,
    };
  };

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    const guestStartButton = page.getByRole('button', { name: '会員登録せずに始める（ゲスト）' });
    if (!(await guestStartButton.count())) {
      throw new Error('ゲスト開始ボタンが見つかりません。認証画面を確認してください。');
    }
    await guestStartButton.click();
    await page.waitForSelector('text=あなたの旅行', { timeout: 30000 }).catch(async () => {
      await guestStartButton.click().catch(() => {});
      await page.waitForSelector('text=あなたの旅行', { timeout: 45000 });
    });

    const tripResult = await openSampleTripOrCreate();
    await ensureWorkspace();
    await runQuickItineraryAdd();

    await page.getByRole('button', { name: 'しおり', exact: true }).click();
    await page.waitForSelector('h2:has-text("しおりを編集")');

    await page.getByRole('button', { name: 'デザイン', exact: true }).click();
    await page.waitForSelector('h2:has-text("表紙・テーマをデコレーションする")');

    await page.getByRole('button', { name: 'しおりPDF' }).first().click();
    await page.waitForSelector('text=しおりPDFの生成を開始しました。', { timeout: 60000 });
    await page.getByRole('button', { name: '思い出PDF' }).first().click();
    await page.waitForSelector('text=思い出PDFの生成を開始しました。', { timeout: 60000 });

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          browser: browserName,
          tripMode: tripResult.mode,
          tripName: tripResult.tripName,
          flow: [
            'guest-login',
            tripResult.mode === 'sample' ? 'load-sample-trip' : 'create-trip',
            'itinerary-one-tap',
            'open-guide',
            'open-design',
            'guide-pdf-trigger',
            'memories-pdf-trigger',
          ],
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
