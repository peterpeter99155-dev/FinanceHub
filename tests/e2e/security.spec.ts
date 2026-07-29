import { expect, test } from '@playwright/test';

const TEST_PASSWORD = 'S3 browser password only';

test('locked screen exposes no financial data and supports retry', async ({
  page,
}) => {
  await page.goto('/?security=locked');

  const password = page.getByTestId('security-password');
  await expect(
    page.getByRole('heading', { name: '解鎖 FinanceHub' }),
  ).toBeVisible();
  await expect(password).toBeFocused();
  await expect(page.getByTestId('net-worth')).toHaveCount(0);
  await expect(page.getByTestId('total-assets')).toHaveCount(0);
  await expect(page.getByText(/TWD/)).toHaveCount(0);
  await expect(page.getByText('示範銀行', { exact: true })).toHaveCount(0);
  await expect(page.getByText('現金', { exact: true })).toHaveCount(0);
  await expect(page.getByText('收支紀錄', { exact: true })).toHaveCount(0);

  await password.fill('wrong browser password');
  await password.press('Enter');
  await expect(page.getByRole('alert')).toContainText('主密碼不正確');
  await expect(password).toBeFocused();

  await password.fill(TEST_PASSWORD);
  await password.press('Enter');
  await expect(page.getByTestId('net-worth')).toContainText(
    'TWD 102,000',
  );
  await expect(page.getByText('示範銀行', { exact: true })).toBeVisible();
});

test('setup requires matching passwords and recovery acknowledgement', async ({
  page,
}) => {
  await page.goto('/?security=setup');

  const password = page.getByTestId('security-password');
  const confirmation = page.getByTestId(
    'security-password-confirmation',
  );
  await expect(password).toBeFocused();
  await expect(page.getByText(/忘記主密碼/)).toBeVisible();
  await expect(page.getByText(/遺失.*metadata/)).toBeVisible();
  await expect(page.getByText(/多個不相關詞/)).toBeVisible();

  await password.fill(TEST_PASSWORD);
  await confirmation.fill(`${TEST_PASSWORD} mismatch`);
  await page
    .getByRole('button', { name: '建立加密資料庫' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    '兩次輸入的主密碼不一致',
  );
  await expect(page.getByTestId('net-worth')).toHaveCount(0);

  await confirmation.fill(TEST_PASSWORD);
  await page
    .getByRole('button', { name: '建立加密資料庫' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    '請先確認你了解資料無法復原',
  );

  await page
    .getByLabel('我了解這兩種情況都無法復原資料')
    .check();
  await page
    .getByRole('button', { name: '建立加密資料庫' })
    .click();
  await expect(page.getByTestId('net-worth')).toBeVisible();
});
