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
  await expect(page.getByText('2026-07-10', { exact: true })).toBeVisible();
  await expect(page.getByText('時間未知').first()).toBeVisible();
  await expect(page.getByLabel('交易語意')).toHaveCount(0);
  const cards = page.getByTestId('import-candidate');
  await cards.nth(1).getByRole('button', { name: '查看與修改' }).click();
  await expect(page.getByText('無法判斷這筆扣抵或退款，請指定交易類型。')).toBeVisible();
  await cards.nth(1).getByTestId('candidate-kind').selectOption('credit_card_refund');
  await page.getByRole('button', { name: '確認可直接處理的項目' }).click();
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

test('尚未建立正式交易的匯入紀錄可移除並重新匯入', async ({ page }) => {
  await openImport(page);
  await page.getByRole('button', { name: '移除紀錄' }).click();
  await expect(page.getByRole('alertdialog')).toContainText(
    '移除後可重新匯入同一份 PDF',
  );
  await page.getByRole('alertdialog').getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  await page.getByRole('button', { name: '移除紀錄' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '移除紀錄' }).click();
  await expect(page.getByText('匯入紀錄已移除，可以重新選擇同一份 PDF。'))
    .toBeVisible();
  await expect(page.getByText('目前沒有匯入紀錄。')).toBeVisible();
  await expect(page.getByTestId('import-candidate')).toHaveCount(0);

  await page.getByRole('button', { name: '選擇 PDF' }).click();
  await page.getByTestId('pdf-password').fill('One-Time-PDF-Password');
  await page.getByTestId('parse-statement').click();
  await expect(page.getByTestId('import-candidate')).toHaveCount(2);
});

test('連結既有交易會顯示差異且不宣稱修改既有交易', async ({ page }) => {
  await openImport(page, 'link');
  const first = page.getByTestId('import-candidate').first();
  await first.getByRole('button', { name: '查看與修改' }).click();
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
  await cards.nth(1).getByRole('button', { name: '查看與修改' }).click();
  await cards.nth(1).getByTestId('candidate-kind').selectOption('credit_card_refund');
  await page.getByRole('button', { name: '確認可直接處理的項目' }).click();
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
  await first.getByRole('button', { name: '查看與修改' }).click();
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

test('批次確認跳過尚未決定的疑似重複並處理其他項目', async ({ page }) => {
  await openImport(page, 'partial-duplicate');
  await page.getByRole('button', { name: '確認可直接處理的項目' }).click();
  await expect(page.getByText('已處理 1 筆；另有 1 筆疑似重複仍待選擇。'))
    .toBeVisible();
  const cards = page.getByTestId('import-candidate');
  await expect(cards.first().getByText('需選擇處理方式')).toBeVisible();
  await expect(cards.nth(1).getByText('已處理：建立新交易')).toBeVisible();
  await cards.first().getByRole('button', { name: '查看與修改' }).click();
  await cards.first().getByRole('button', { name: '確認此筆' }).click();
  await expect(page.getByText('疑似重複的項目仍需選擇處理方式。'))
    .toBeVisible();
  await expect(cards.first().getByText(/已處理：/)).toHaveCount(0);
  await expect(cards.first().getByText('這筆資料要怎麼處理？')).toBeVisible();
});

test('退款可輸入負號並以正數退款交易確認', async ({ page }) => {
  await openImport(page);
  const candidate = page.getByTestId('import-candidate').nth(1);
  await candidate.getByRole('button', { name: '查看與修改' }).click();
  await candidate.getByLabel('金額（TWD，退款可輸入負號）').fill('-100');
  await expect(candidate.getByTestId('candidate-kind'))
    .toHaveValue('credit_card_refund');
  await candidate.getByRole('button', { name: '確認此筆' }).click();
  await expect(candidate.getByText('已處理：建立新交易')).toBeVisible();
  await page.getByRole('button', { name: '收支紀錄' }).click();
  await page.getByRole('button', { name: '上個月' }).click();
  await expect(page.getByText('虛構扣抵', { exact: true })).toBeVisible();
  await expect(page.getByText('-100', { exact: true })).toHaveCount(0);
});

test('單筆檢查完成後若整批仍有差額會在核對區說明', async ({ page }) => {
  await openImport(page, 'reconciliation-mismatch');
  const candidate = page.getByTestId('import-candidate').nth(1);
  await candidate.getByRole('button', { name: '查看與修改' }).click();
  await candidate.getByTestId('candidate-kind').selectOption(
    'credit_card_purchase',
  );
  await expect(candidate.getByText('已檢查', { exact: true })).toBeVisible();
  await expect(candidate.getByText('需檢查內容', { exact: true }))
    .toHaveCount(0);
  await candidate.getByRole('button', { name: '確認此筆' }).click();

  const summary = page.getByLabel('帳單匯入摘要');
  await expect(summary.getByRole('alert')).toContainText(
    '這筆內容已完成檢查，但整份帳單仍差 TWD 300',
  );
  await expect(page.locator('.import-feedback-slot').getByRole('alert'))
    .toHaveCount(0);
  await expect(candidate.getByText(/已處理：/)).toHaveCount(0);
});

test('修正候選金額後重新顯示目前加總與差額', async ({ page }) => {
  await openImport(page, 'confirm-failure');
  const candidate = page.getByTestId('import-candidate').first();
  await candidate.getByRole('button', { name: '查看與修改' }).click();
  await candidate.getByLabel('金額（TWD，退款可輸入負號）').fill('1300');
  await candidate.getByRole('button', { name: '確認此筆' }).click();

  await expect(page.getByText('目前明細加總').locator('..'))
    .toContainText('TWD 1,200');
  await expect(page.getByText('差額').locator('..'))
    .toContainText('TWD 100');
});

test('匯入紀錄顯示載入、空白、失敗與查看失敗狀態', async ({ page }) => {
  await page.goto('/?import=history-loading');
  await page.getByRole('button', { name: '帳單匯入' }).click();
  await expect(page.getByText('正在載入匯入紀錄…')).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('financehub-test-import-history-ready'));
  });
  await expect(page.getByRole('button', { name: '查看內容' })).toBeVisible();

  await page.goto('/?import=history-empty');
  await page.getByRole('button', { name: '帳單匯入' }).click();
  await expect(page.getByText('目前沒有匯入紀錄。')).toBeVisible();

  await page.goto('/?import=history-error');
  await page.getByRole('button', { name: '帳單匯入' }).click();
  await expect(page.getByRole('alert')).toContainText(
    '待確認項目已處理、資料不完整或不存在。',
  );
  await expect(page.getByRole('button', { name: '重新載入' })).toBeVisible();

  await page.goto('/?import=history-open-error');
  await page.getByRole('button', { name: '帳單匯入' }).click();
  await page.getByRole('button', { name: '查看內容' }).click();
  await expect(page.getByRole('alert')).toContainText(
    '待確認項目已處理、資料不完整或不存在。',
  );
});

test('解析中、沒有候選及沒有可連結交易都有明確狀態', async ({ page }) => {
  await page.goto('/?import=parse-loading');
  await page.getByRole('button', { name: '帳單匯入' }).click();
  await page.getByRole('button', { name: '選擇 PDF' }).click();
  await page.getByTestId('pdf-password').fill('One-Time-PDF-Password');
  await page.getByTestId('parse-statement').click();
  await expect(page.getByTestId('parse-statement')).toHaveText('解析中…');
  await expect(page.getByTestId('parse-statement')).toBeDisabled();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('financehub-test-import-parse-ready'));
  });
  await expect(page.getByText(
    '帳單解析完成；一般項目可直接確認，需要時再展開修改。',
  )).toBeVisible();

  await openImport(page, 'empty-candidates');
  await expect(page.getByText('這份帳單目前沒有可處理的候選項目。'))
    .toBeVisible();

  await openImport(page, 'observation-only-duplicate');
  const candidate = page.getByTestId('import-candidate').first();
  await candidate.getByRole('button', { name: '查看與修改' }).click();
  await candidate.getByLabel('連結既有交易').check();
  await expect(candidate.getByText('目前沒有可連結的既有交易。'))
    .toBeVisible();
});
