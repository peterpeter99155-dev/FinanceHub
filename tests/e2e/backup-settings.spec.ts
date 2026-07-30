import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '資料與備份' }).click();
  await expect(
    page.getByRole('heading', { name: '資料與備份' }),
  ).toBeVisible();
});

test('shows backup state and updates manual backup settings', async ({
  page,
}) => {
  await expect(page.getByText('尚未建立備份')).toBeVisible();
  await expect(
    page.getByText('C:\\FinanceHub-Test-Data\\backups'),
  ).toBeVisible();

  await page.getByTestId('backup-now').click();
  await expect(page.getByText('備份狀態正常')).toBeVisible();
  await expect(page.getByText('1 份')).toBeVisible();

  await page.getByLabel('啟用自動備份').uncheck();
  await expect(page.getByLabel('啟用自動備份')).not.toBeChecked();
  await page
    .getByLabel('保留最近幾份成功備份')
    .selectOption('14');
  await expect(
    page.getByLabel('保留最近幾份成功備份'),
  ).toHaveValue('14');
});

test('manual status choices exclude system-only states', async ({ page }) => {
  await page.getByRole('button', { name: '資產與負債' }).click();
  await page.getByTestId('advanced-settings').click();
  const status = page.getByLabel('這筆金額的可信程度');

  await expect(status.locator('option')).toHaveCount(2);
  await expect(status.locator('option')).toHaveText([
    '我已確認金額正確',
    '我之後再確認',
  ]);
});

test('shows running, failure and warning states', async ({ page }) => {
  await page.goto('/?backup=running');
  await page.getByRole('button', { name: '資料與備份' }).click();
  await expect(page.getByText('備份進行中…')).toBeVisible();

  await page.goto('/?backup=warnings');
  await page.getByRole('button', { name: '資料與備份' }).click();
  await expect(page.getByText(/最近一次備份未完成/).last()).toBeVisible();
  await expect(
    page.getByText('新備份已建立，但無法清理部分舊備份。'),
  ).toBeVisible();
  await expect(
    page.getByText('備份檔已建立，但無法更新備份狀態紀錄。'),
  ).toBeVisible();
});

test('primary views do not overflow a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['資料與備份', '資產與負債', '收支紀錄']) {
    await page.getByRole('button', { name }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
