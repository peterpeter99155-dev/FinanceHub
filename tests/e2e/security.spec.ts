import { expect, test } from '@playwright/test';

const TEST_PASSWORD = 'S3-Browser-Password!';

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
  await expect(password).toHaveAttribute(
    'placeholder',
    '8 至 64 個半形英文、數字或特殊符號',
  );
  await expect(confirmation).toHaveAttribute(
    'placeholder',
    '請再輸入一次相同密碼',
  );
  await expect(page.getByText('financehub.db', { exact: true })).toBeVisible();
  await expect(
    page.getByText('financehub.db.metadata.json', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('C:\\FinanceHub-Test-Data')).toBeVisible();
  await expect(page.getByText(/忘記密碼/)).toBeVisible();
  await expect(page.getByText(/遺失上述任一檔案/)).toBeVisible();

  await password.fill('中文 Abc123! 密碼');
  await expect(password).toHaveValue('Abc123!');
  await password.fill('a'.repeat(65));
  await expect(password).toHaveValue('a'.repeat(64));
  await password.fill(TEST_PASSWORD);
  const visibilityButton = page
    .getByRole('button', { name: '顯示密碼' })
    .first();
  await expect(visibilityButton).toHaveAttribute(
    'data-password-visibility',
    'hidden',
  );
  await expect(
    visibilityButton.getByTestId('password-hidden-icon'),
  ).toBeVisible();
  await visibilityButton.click();
  await expect(password).toHaveAttribute('type', 'text');
  const hideButton = page.getByRole('button', { name: '隱藏密碼' });
  await expect(hideButton).toHaveAttribute(
    'data-password-visibility',
    'visible',
  );
  await expect(
    hideButton.getByTestId('password-visible-icon'),
  ).toBeVisible();
  await hideButton.click();
  await expect(password).toHaveAttribute('type', 'password');

  await confirmation.fill(`${TEST_PASSWORD}-Mismatch`);
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
    .getByLabel('我了解必須記住密碼，並一起備份兩個資料檔案')
    .check();
  await page
    .getByRole('button', { name: '建立加密資料庫' })
    .click();
  await expect(page.getByTestId('net-worth')).toBeVisible();
});
