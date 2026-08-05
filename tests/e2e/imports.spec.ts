import { expect, test } from '@playwright/test';

async function openImport(page: import('@playwright/test').Page, scenario = 'ready') {
  await page.goto(`/?import=${scenario}`);
  await expect(page.getByText('FinanceHub', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '帳單匯入' }).click();
  await page.getByRole('button', { name: '選擇 PDF' }).click();
  await page.getByTestId('pdf-password').fill('One-Time-PDF-Password');
  await page.getByTestId('parse-statement').click();
}

test('匯入預覽顯示核對、時間未知、警告並可批次確認', async ({ page }) => {
  await openImport(page);
  await expect(page.getByTestId('import-reconciliation')).toContainText('一致');
  await expect(page.getByText('2026-07-10・時間未知')).toBeVisible();
  await expect(page.getByText('無法判斷這筆扣抵或退款，請指定交易類型。')).toBeVisible();
  const cards = page.getByTestId('import-candidate');
  await cards.nth(1).getByTestId('candidate-kind').selectOption('credit_card_refund');
  await page.getByRole('button', { name: '確認全部處理方式' }).click();
  await expect(page.getByText('這批資料已完成處理。')).toBeVisible();
  await expect(page.getByText('已處理：建立新交易')).toHaveCount(2);
  await page.getByRole('button', { name: '收支紀錄' }).click();
  await page.getByRole('button', { name: '上個月' }).click();
  await expect(page.getByText('虛構餐廳', { exact: true })).toBeVisible();
  await expect(page.getByText('虛構扣抵', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '帳單匯入' }).click();
  await expect(page.getByRole('heading', { name: '匯入紀錄' })).toBeVisible();
  await page.getByRole('button', { name: '查看內容' }).click();
  await expect(page.getByText('已處理：建立新交易')).toHaveCount(2);
});

test('重複匯入會開啟既有批次而不是建立第二份', async ({ page }) => {
  await openImport(page, 'duplicate');
  await expect(page.getByText('這份帳單先前已匯入，已顯示既有內容。'))
    .toBeVisible();
  await expect(page.getByTestId('import-candidate')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: '匯入紀錄' })).toBeVisible();
});

test('連結既有交易會顯示差異且不宣稱修改既有交易', async ({ page }) => {
  await openImport(page, 'link');
  const first = page.getByTestId('import-candidate').first();
  await first.getByLabel('連結既有交易').check();
  await first.getByTestId('existing-transaction').selectOption('existing-card-transaction');
  await expect(first.getByTestId('import-differences')).toContainText('既有虛構餐廳');
  await expect(first.getByTestId('import-differences')).toContainText('虛構信用卡');
  await expect(first.getByTestId('import-differences')).toContainText('飲食');
  await expect(first.getByText('連結只建立來源關聯，不會修改既有交易。')).toBeVisible();
  await first.getByRole('button', { name: '確認此筆' }).click();
  await expect(first.getByText('已處理：連結既有交易')).toBeVisible();
});

test('批次失敗不顯示成功', async ({ page }) => {
  await openImport(page, 'confirm-failure');
  const cards = page.getByTestId('import-candidate');
  await cards.nth(1).getByTestId('candidate-kind').selectOption('credit_card_refund');
  await page.getByRole('button', { name: '確認全部處理方式' }).click();
  await expect(page.getByText('待確認項目已處理、資料不完整或不存在。')).toBeVisible();
  await expect(page.getByText('這批資料已完成處理。')).toHaveCount(0);
  await expect(page.getByText(/已處理：/)).toHaveCount(0);
});

test('沒有信用卡時可在匯入頁快速新增並自動選取', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '帳單匯入' }).click();
  await expect(page.getByRole('heading', { name: '匯入信用卡月結帳單' }))
    .toBeVisible();
  await expect(page.getByText('匯入永豐信用卡月結帳單')).toHaveCount(0);
  await expect(page.getByText('請先新增要對應的信用卡。')).toBeVisible();
  await page.getByRole('button', { name: '新增信用卡' }).click();
  await page.getByLabel('信用卡名稱').fill('虛構信用卡');
  await page.getByRole('button', { name: '建立並選取' }).click();
  await expect(page.getByRole('heading', { name: '匯入信用卡月結帳單' }))
    .toBeVisible();
  await expect(page.getByTestId('import-card')).toHaveValue(/item-/);
  await expect(page.getByTestId('import-card')).toContainText('虛構信用卡');
});

test('疑似重複與分類只提出建議並由使用者採用', async ({ page }) => {
  await openImport(page, 'suggestions');
  const first = page.getByTestId('import-candidate').first();
  await expect(first.getByTestId('duplicate-suggestion')).toContainText(
    '不會自動合併或刪除',
  );
  await expect(first.getByTestId('category-suggestion')).toContainText(
    '建議分類：飲食',
  );
  await expect(first.getByLabel('支出分類')).toHaveValue(
    'expense-uncategorized',
  );
  await first.getByLabel('支出分類').selectOption('expense-other');
  await expect(first.getByLabel('支出分類')).toHaveValue('expense-other');
  await first.getByRole('button', { name: '採用建議' }).click();
  await expect(first.getByLabel('支出分類')).toHaveValue('expense-food');
  await first.getByRole('button', { name: /比較並連結/ }).click();
  await expect(first.getByLabel('連結既有交易')).toBeChecked();
  await expect(first.getByTestId('existing-transaction')).toHaveValue(
    'existing-card-transaction',
  );
});
