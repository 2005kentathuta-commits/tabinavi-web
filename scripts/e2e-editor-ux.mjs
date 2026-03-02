#!/usr/bin/env node
/* eslint-disable no-console */

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
  const itineraryHeading = page.locator('h2:has-text("旅程を編集")');
  if (await itineraryHeading.count()) {
    return;
  }

  const firstTrip = page.locator('.trip-list button').first();
  if (await firstTrip.count()) {
    await firstTrip.click();
  }

  await page.waitForSelector('h2:has-text("旅程を編集")');
}

async function createTrip(page) {
  await page.waitForSelector('text=あなたの旅行');
  const createForm = page.locator('aside.side-panel form').first();
  const tripName = `UX検証-${Date.now()}`;
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
}

async function openFoldPanel(page, labelText) {
  const toggle = page.locator('button.fold-toggle', { hasText: labelText }).first();
  await toggle.waitFor({ state: 'visible' });
  const text = String(await toggle.textContent());
  if (text.includes('▶')) {
    await toggle.click();
  }
}

async function collapseFoldPanel(page, labelText) {
  const toggle = page.locator('button.fold-toggle', { hasText: labelText }).first();
  await toggle.waitFor({ state: 'visible' });
  const text = String(await toggle.textContent());
  if (text.includes('▼')) {
    await toggle.click();
  }
}

async function saveTemplate(page, templateId) {
  await page.getByRole('button', { name: 'デザイン', exact: true }).click();
  await page.waitForSelector('h2:has-text("表紙・テーマをデコレーションする")');
  await page.locator('label:has-text("UIテンプレート") select').first().selectOption(templateId);
  await page.getByRole('button', { name: 'デザインを保存' }).click();
  await page.waitForSelector('text=デザインを保存しました。');
  await page.getByRole('button', { name: '計画', exact: true }).click();
  await page.waitForSelector(`.ui-template-${templateId}`);
}

async function runItineraryUxPass(page, templateId) {
  await page.getByRole('button', { name: '計画', exact: true }).click();
  await page.waitForSelector('h2:has-text("旅程を編集")');
  await openFoldPanel(page, '1. 予定を追加');
  await openFoldPanel(page, '2. 並び替え・編集');

  const addForm = page.locator('section.fold-panel', { hasText: '1. 予定を追加' }).locator('form').first();
  const title = `予定-${templateId}-${Date.now()}`;
  const draftTitle = `下書き-${templateId}-${Date.now()}`;
  await addForm.getByLabel('日付').fill(todayIso());
  await addForm.getByLabel('開始').fill('09:00');
  await addForm.getByLabel('終了').fill('10:00');
  await addForm.getByLabel('予定タイトル').fill(title);
  await addForm.getByLabel('場所').fill('東京駅');
  await addForm.getByRole('button', { name: '入力内容で追加' }).click();

  const card = page.locator('.itinerary-card').filter({ hasText: title }).first();
  await card.waitFor({ state: 'visible' });
  await card.getByRole('button', { name: '複製' }).click();
  const copiedTitle = `${title}（コピー）`;
  const copiedCard = page.locator('.itinerary-card').filter({ hasText: copiedTitle }).first();
  await copiedCard.waitFor({ state: 'visible' });
  await copiedCard.getByRole('button', { name: '↑' }).click();

  await collapseFoldPanel(page, '1. 予定を追加');
  await page.waitForSelector('button.fold-toggle:has-text("▶ 1. 予定を追加")');
  await openFoldPanel(page, '1. 予定を追加');

  await addForm.getByLabel('予定タイトル').fill(draftTitle);
  await page.waitForTimeout(1000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureWorkspace(page);
  await page.getByRole('button', { name: '計画', exact: true }).click();
  await openFoldPanel(page, '1. 予定を追加');
  const restored = await page
    .locator('section.fold-panel', { hasText: '1. 予定を追加' })
    .locator('form')
    .first()
    .getByLabel('予定タイトル')
    .inputValue();
  if (restored !== draftTitle) {
    throw new Error(`自動保存の復元に失敗: expected=${draftTitle} actual=${restored}`);
  }

  await page
    .locator('section.fold-panel', { hasText: '1. 予定を追加' })
    .locator('form')
    .first()
    .getByLabel('予定タイトル')
    .fill('');
}

async function runGuideUxPass(page, templateId) {
  await page.getByRole('button', { name: 'しおり', exact: true }).click();
  await page.waitForSelector('h2:has-text("しおりを編集")');
  await openFoldPanel(page, '1. 項目を作る');
  await openFoldPanel(page, '2. 一覧を編集');

  const form = page.locator('section.fold-panel', { hasText: '1. 項目を作る' }).locator('form').first();
  const title = `しおり-${templateId}-${Date.now()}`;
  await form.getByLabel('見出し').fill(title);
  await form.getByLabel('本文').fill('編集UXの検証用セクション');
  await form.getByRole('button', { name: 'しおりに追加' }).click();

  const card = page.locator('.guide-card').filter({ hasText: title }).first();
  await card.waitFor({ state: 'visible' });
  await card.getByRole('button', { name: '複製' }).click();
  const copied = page.locator('.guide-card').filter({ hasText: `${title}（コピー）` }).first();
  await copied.waitFor({ state: 'visible' });
  await copied.getByRole('button', { name: '↑' }).click();

  await collapseFoldPanel(page, '1. 項目を作る');
  await page.waitForSelector('button.fold-toggle:has-text("▶ 1. 項目を作る")');
  await openFoldPanel(page, '1. 項目を作る');
}

async function main() {
  const { chromium } = await loadPlaywright();
  const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(120000);

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '会員登録せずに始める（ゲスト）' }).click();
    const tripName = await createTrip(page);
    await ensureWorkspace(page);

    const templates = ['templateA', 'templateB'];
    for (const templateId of templates) {
      await saveTemplate(page, templateId);
      await runItineraryUxPass(page, templateId);
      await runGuideUxPass(page, templateId);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          tripName,
          templates,
          checks: ['itinerary-reorder', 'itinerary-duplicate', 'panel-fold', 'draft-autosave', 'guide-reorder', 'guide-duplicate'],
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
