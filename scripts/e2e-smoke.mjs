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

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    const guestStartButton = page.getByRole('button', { name: '会員登録せずに始める（ゲスト）' });
    if (!(await guestStartButton.count())) {
      throw new Error('ゲスト開始ボタンが見つかりません。認証画面を確認してください。');
    }
    await guestStartButton.click();

    await page.waitForSelector('text=あなたの旅行');

    const demoButton = page.getByRole('button', { name: 'サンプル旅行を読み込む' });
    await demoButton.click();

    await page.waitForSelector('text=サンプル旅行', { timeout: 180000 });

    await page.getByRole('button', { name: 'しおり', exact: true }).click();
    await page.waitForSelector('text=しおりプレビュー（目次付き）');

    await page.getByRole('button', { name: 'しおりPDF' }).first().click();
    await page.waitForSelector('text=しおりPDFの生成を開始しました。', { timeout: 60000 });

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          flow: ['guest-login', 'load-demo-trip', 'open-guide-preview', 'pdf-trigger'],
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
