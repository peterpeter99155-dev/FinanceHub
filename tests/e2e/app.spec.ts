import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('FinanceHub', { exact: true })).toBeVisible();
});

test('US-07 loads existing balances without creating income', async ({
  page,
}) => {
  await expect(page.getByTestId('total-assets')).toContainText(
    'TWD 102,000',
  );
  await expect(page.getByTestId('net-worth')).toContainText('TWD 102,000');

  await page.getByRole('button', { name: '收支紀錄' }).click();
  await expect(page.getByText('這個月還沒有交易。')).toBeVisible();
  await expect(summaryCard(page, '本月收入')).toContainText('TWD 0');
});

test('US-01 and US-02 create income and expense through the UI', async ({
  page,
}) => {
  await page.getByRole('button', { name: '收支紀錄' }).click();

  await page.getByTestId('transaction-kind').selectOption('income');
  await page.getByLabel('入帳帳戶（選填）').selectOption('bank-1');
  await page
    .getByTestId('transaction-category')
    .selectOption('income-salary');
  await page.getByTestId('transaction-amount').fill('50000');
  await page.getByLabel('備註（選填）').fill('七月薪資');
  await page.getByTestId('save-transaction').click();

  await expect(
    page.locator('.transaction-list').getByText('薪資', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('備註：七月薪資')).toBeVisible();
  await expect(summaryCard(page, '本月收入')).toContainText(
    'TWD ＋50,000',
  );
  await expect(
    page.getByRole('region', { name: '帳戶概況' }),
  ).toContainText('TWD 150,000');

  await page.getByTestId('transaction-kind').selectOption('expense');
  await page.getByLabel('扣款帳戶（選填）').selectOption('bank-1');
  await page
    .getByTestId('transaction-category')
    .selectOption('expense-communication');
  await page.getByTestId('transaction-amount').fill('599');
  await page.getByTestId('save-transaction').click();

  await expect(
    page.locator('.transaction-list').getByText('通訊', { exact: true }),
  ).toBeVisible();
  await expect(summaryCard(page, '本月支出')).toContainText(
    'TWD −599',
  );
  await expect(page.getByText('當日收支').locator('..')).toContainText(
    'TWD ＋49,401',
  );
});

test('US-06 edits and deletes a transaction, restoring the UI state', async ({
  page,
}) => {
  await page.getByRole('button', { name: '收支紀錄' }).click();
  await createExpense(page, '599');

  await page.getByRole('button', { name: '編輯 通訊' }).click();
  await expect(page.getByText('編輯中')).toBeVisible();
  await expect(page.getByTestId('transaction-amount')).toHaveValue(
    '599',
  );
  await page.getByTestId('transaction-amount').fill('699');
  await page.getByTestId('save-transaction').click();
  await expect(summaryCard(page, '本月支出')).toContainText(
    'TWD −699',
  );

  await page.getByRole('button', { name: '刪除 通訊' }).click();
  await expect(page.getByRole('alertdialog')).toContainText(
    '帳戶餘額及本月統計會自動還原',
  );
  await page.getByRole('button', { name: '刪除交易' }).click();

  await expect(page.getByText('這個月還沒有交易。')).toBeVisible();
  await expect(summaryCard(page, '本月支出')).toContainText('TWD 0');
  await expect(page.getByTestId('transaction-amount')).toHaveValue('');
});

test('shows input errors and preserves asset-form focus after deletion', async ({
  page,
}) => {
  await page.getByTestId('item-amount').fill('1000000000000');
  await expect(page.getByRole('status')).toContainText(
    '單筆金額上限為 TWD 999,999,999,999',
  );

  await page
    .locator('.form-panel')
    .locator('.inline-action')
    .click();
  await expect(
    page.getByRole('dialog', { name: '管理類型與分類' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '關閉' }).click();

  const bankRow = page.getByTestId('financial-item-bank-1');
  await bankRow.getByRole('button', { name: '刪除 示範銀行' }).click();
  await page.getByRole('button', { name: '永久刪除' }).click();
  await expect(page.getByTestId('item-name')).toBeFocused();
});

test('covers the asset and liability create, edit, and delete flow', async ({
  page,
}) => {
  await expectFinancialSummary(page, '102,000', '0', '102,000');

  await page.getByTestId('item-name').fill('E2E asset');
  await page.getByTestId('item-type').selectOption('property');
  await page.getByTestId('item-amount').fill('1000');
  await page.getByTestId('save-item').click();
  await expect(page.getByTestId('financial-item-item-1')).toBeVisible();
  await expectFinancialSummary(page, '103,000', '0', '103,000');

  await page.locator('.segmented-control button').nth(1).click();
  await expect(page.getByTestId('item-type')).toHaveValue('mortgage');
  await page.getByTestId('item-name').fill('E2E liability');
  await page.getByTestId('item-type').selectOption('mortgage');
  await page.getByTestId('item-amount').fill('50000');
  await page.getByTestId('save-item').click();
  const liabilityRow = page.getByTestId('financial-item-item-2');
  await expect(liabilityRow).toBeVisible();
  await expectFinancialSummary(page, '103,000', '50,000', '53,000');

  await liabilityRow.getByRole('button').first().click();
  await expect(page.getByTestId('item-amount')).toHaveValue('50000');
  await page.getByTestId('item-amount').fill('40000');
  await page.getByTestId('save-item').click();
  await expectFinancialSummary(page, '103,000', '40,000', '63,000');

  const assetRow = page.getByTestId('financial-item-item-1');
  await assetRow.getByRole('button').last().click();
  const deleteDialog = page.getByRole('alertdialog');
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole('button').last().click();
  await expect(assetRow).toHaveCount(0);
  await expectFinancialSummary(page, '102,000', '40,000', '62,000');
});

async function createExpense(
  page: import('@playwright/test').Page,
  amount: string,
): Promise<void> {
  await page.getByLabel('扣款帳戶（選填）').selectOption('bank-1');
  await page
    .getByTestId('transaction-category')
    .selectOption('expense-communication');
  await page.getByTestId('transaction-amount').fill(amount);
  await page.getByTestId('save-transaction').click();
  await expect(
    page.locator('.transaction-list').getByText('通訊', { exact: true }),
  ).toBeVisible();
}

function summaryCard(
  page: import('@playwright/test').Page,
  label: string,
) {
  return page.locator('.transaction-summary-card').filter({
    hasText: label,
  });
}

async function expectFinancialSummary(
  page: import('@playwright/test').Page,
  assets: string,
  liabilities: string,
  netWorth: string,
): Promise<void> {
  await expect(page.getByTestId('total-assets')).toContainText(
    `TWD ${assets}`,
  );
  await expect(page.getByTestId('total-liabilities')).toContainText(
    `TWD ${liabilities}`,
  );
  await expect(page.getByTestId('net-worth')).toContainText(
    `TWD ${netWorth}`,
  );
}
