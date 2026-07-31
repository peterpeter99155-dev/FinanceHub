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
  await expect(
    page.getByText('C:\\FinanceHub-Test-Data', { exact: true }),
  ).toBeVisible();

  await page.getByTestId('backup-now').click();
  const successFeedback = page.getByText('備份已完成');
  await expect(successFeedback).toBeVisible();
  await expect(successFeedback).toHaveClass(/success/);
  await expect(page.getByText('備份狀態正常')).toBeVisible();
  await expect(page.getByText('1 / 7 份')).toBeVisible();

  await page.getByLabel('啟用自動備份').uncheck();
  await expect(page.getByLabel('啟用自動備份')).not.toBeChecked();
  await page
    .getByLabel('保留最近幾份成功備份')
    .selectOption('14');
  await expect(
    page.getByLabel('保留最近幾份成功備份'),
  ).toHaveValue('14');

  await page.getByRole('button', { name: '重新整理狀態' }).click();
  await expect(page.getByText('備份狀態已更新')).toBeVisible();

  await page.getByRole('button', { name: '查看備份說明' }).click();
  const helpDialog = page.getByRole('dialog');
  await expect(helpDialog).toBeVisible();
  await expect(helpDialog).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(
    page.getByText(/資料庫、metadata 與 manifest 三個檔案/),
  ).toBeVisible();
  await page.getByRole('button', { name: '我知道了' }).click();

  await page.getByRole('button', { name: '匯出最新備份' }).click();
  await expect(page.getByText('最新備份已匯出')).toBeVisible();
});

test('shows failed backup feedback below the page heading', async ({
  page,
}) => {
  await page.goto('/?backup=failure');
  await page.getByRole('button', { name: '資料與備份' }).click();
  await page.getByTestId('backup-now').click();

  const feedback = page.getByText(
    '無法存取備份資料夾，請稍後再試。',
  );
  await expect(feedback).toBeVisible();
  await expect(feedback).toHaveClass(/error/);
  const [headingBox, feedbackBox] = await Promise.all([
    page.getByRole('heading', { name: '資料與備份' }).boundingBox(),
    feedback.boundingBox(),
  ]);
  expect(feedbackBox!.y).toBeGreaterThan(headingBox!.y);
});

test('confirms a manual backup before replacing the oldest backup', async ({
  page,
}) => {
  await page.goto('/?backup=capacity');
  await page.getByRole('button', { name: '資料與備份' }).click();
  await expect(page.getByText('7 / 7 份')).toBeVisible();

  await page.getByTestId('backup-now').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(
    '建立新備份後，將移除最舊的 1 份備份',
  );
  await expect(dialog).toContainText('2026年7月21日');
  await page.getByRole('button', { name: '繼續備份' }).click();

  await expect(
    page.getByText('備份已完成，並已移除最舊的 1 份備份'),
  ).toBeVisible();
  await expect(page.getByText('7 / 7 份')).toBeVisible();
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
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('financehub-test-backup-complete'),
    ),
  );
  await expect(page.getByText('備份狀態正常')).toBeVisible();

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
