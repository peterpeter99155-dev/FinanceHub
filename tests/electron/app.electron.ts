import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ElectronApplication,
  Page,
  _electron as electron,
  expect,
  test,
} from '@playwright/test';

const executablePath = path.resolve(
  'node_modules',
  'electron',
  'dist',
  'electron.exe',
);
const applicationEntry = path.resolve('.webpack', 'x64', 'main');

test('completes the Sprint 01 net-worth flow and persists data', async () => {
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), 'financehub-e2e-'),
  );
  let application: ElectronApplication | undefined;

  try {
    application = await launchApplication(userDataDirectory);
    let page = await application.firstWindow();

    const ipcError = await page.evaluate(async () => {
      try {
        await window.financeHub.financialItems.create({
          name: 'IPC error probe',
          direction: 'asset',
          type: 'cash',
          amount: 0,
          status: 'confirmed',
          includeInNetWorth: true,
        });
        return undefined;
      } catch (error) {
        return error;
      }
    });
    expect(ipcError).toMatchObject({
      code: 'AMOUNT_MUST_BE_POSITIVE',
    });

    await expect(page.getByTestId('net-worth')).toContainText('TWD 0');
    await expect(page.getByTestId('summary-equation')).toContainText(
      '淨資產',
    );
    await expect(page.getByTestId('summary-equation')).toContainText('=');
    await expect(page.getByTestId('summary-equation')).toContainText('−');
    await expect(page.getByTestId('item-amount')).toHaveAttribute(
      'type',
      'text',
    );
    await expect(page.getByTestId('item-amount')).toHaveValue('');
    await expect(
      page.getByTestId('asset-group').getByText('尚未建立資產'),
    ).toBeVisible();
    await expect(
      page
        .getByTestId('liability-group')
        .getByText('尚未建立負債'),
    ).toBeVisible();
    await expect(page.getByTestId('advanced-settings')).not.toHaveAttribute(
      'open',
      '',
    );
    await page.getByTestId('advanced-settings').locator('summary').click();
    await expect(page.getByText('列入我的資產')).toBeVisible();
    await page
      .getByRole('button', { name: '負債', exact: true })
      .click();
    await expect(page.getByText('列入我的負債')).toBeVisible();
    await page
      .getByRole('button', { name: '資產', exact: true })
      .click();
    await page.getByTestId('advanced-settings').locator('summary').click();
    await page.getByTestId('item-amount').fill('0');
    await expect(page.getByTestId('save-item')).toBeDisabled();
    await expect(page.getByText('金額必須大於 0。')).toBeVisible();
    await page.getByTestId('item-amount').fill('');
    await page.getByTestId('item-amount').fill('1000000000000');
    await expect(page.getByRole('status')).toContainText(
      '單筆金額上限為 TWD 999,999,999,999',
    );
    await expect(page.getByTestId('item-amount')).toHaveValue('');

    await createItem(page, {
      name: '示範銀行存款',
      type: 'bank_deposit',
      amount: '1000000',
    });
    await expect(page.locator('time').first()).toContainText('2026');
    await createItem(page, {
      name: '示範房產',
      type: 'property',
      amount: '8000000',
    });
    await createItem(page, {
      name: '示範房貸',
      direction: '負債',
      type: 'mortgage',
      amount: '5000000',
    });

    await expect(page.getByTestId('total-assets')).toContainText(
      'TWD 9,000,000',
    );
    await expect(page.getByTestId('total-liabilities')).toContainText(
      'TWD 5,000,000',
    );
    await expect(page.getByTestId('net-worth')).toContainText(
      'TWD 4,000,000',
    );
    await expect(page.getByTestId('asset-group')).toContainText(
      '示範銀行存款',
    );
    await expect(page.getByTestId('asset-group')).toContainText(
      '示範房產',
    );
    await expect(page.getByTestId('asset-group')).not.toContainText(
      '示範房貸',
    );
    await expect(page.getByTestId('liability-group')).toContainText(
      '示範房貸',
    );

    const mortgageRow = page
      .getByText('示範房貸', { exact: true })
      .locator('..')
      .locator('..');
    await mortgageRow.getByRole('button', { name: '編輯' }).click();
    await expect(page.getByTestId('item-amount')).toHaveValue('5000000');
    await page.getByTestId('item-amount').fill('4900000');
    await page.getByTestId('save-item').click();

    await expect(page.getByTestId('net-worth')).toContainText(
      'TWD 4,100,000',
    );

    await application.close();
    application = await launchApplication(userDataDirectory);
    page = await application.firstWindow();

    await expect(page.getByTestId('net-worth')).toContainText(
      'TWD 4,100,000',
    );
    await expect(
      page.getByText('示範銀行存款', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('示範房產', { exact: true })).toBeVisible();
    await expect(page.getByText('示範房貸', { exact: true })).toBeVisible();

    const propertyRow = page
      .getByText('示範房產', { exact: true })
      .locator('..')
      .locator('..');
    await propertyRow.getByRole('button', { name: '刪除' }).click();
    const deleteDialog = page.getByRole('alertdialog');
    await expect(deleteDialog).toBeVisible();
    await deleteDialog
      .getByRole('button', { name: '永久刪除' })
      .click();

    await expect(
      page.getByText('示範房產', { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByTestId('total-assets')).toContainText(
      'TWD 1,000,000',
    );
    await expect(page.getByTestId('total-liabilities')).toContainText(
      'TWD 4,900,000',
    );
    await expect(page.getByTestId('item-name')).toBeFocused();
    await page
      .getByTestId('item-name')
      .fill('刪除後可以立即輸入');
    await expect(page.getByTestId('item-name')).toHaveValue(
      '刪除後可以立即輸入',
    );
    await page.getByTestId('item-name').fill('');
    await page.getByTestId('item-type').selectOption('cash');
    await page.getByTestId('item-amount').fill('500');
    await page.getByTestId('save-item').click();
    await expect(
      page.getByTestId('asset-group').getByText('現金', {
        exact: true,
      }),
    ).toBeVisible();

    await page.locator('.form-panel .inline-action').click();
    const managementDialog = page.getByRole('dialog', {
      name: '管理類型與分類',
    });
    await expect(managementDialog).toBeVisible();
    await managementDialog.getByLabel('新名稱').fill('緊急預備金');
    await managementDialog.getByRole('button', { name: '新增' }).click();
    await expect(
      managementDialog.getByLabel('緊急預備金名稱'),
    ).toBeVisible();
    await managementDialog.getByRole('button', { name: '關閉' }).click();

    await page
      .getByTestId('item-type')
      .selectOption({ label: '緊急預備金' });
    await page.getByTestId('item-amount').fill('30000');
    await page.getByTestId('save-item').click();
    await expect(
      page.getByTestId('asset-group').getByText('緊急預備金', {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await application?.close();
    rmSync(userDataDirectory, { recursive: true, force: true });
  }
});

async function launchApplication(
  userDataDirectory: string,
): Promise<ElectronApplication> {
  return electron.launch({
    executablePath,
    args: [
      applicationEntry,
      `--user-data-dir=${userDataDirectory}`,
      '--disable-gpu',
    ],
  });
}

async function createItem(
  page: Page,
  input: {
    name: string;
    direction?: '資產' | '負債';
    type: string;
    amount: string;
  },
): Promise<void> {
  if (input.direction === '負債') {
    await page
      .getByRole('button', { name: '負債', exact: true })
      .click();
    await expect(page.getByTestId('item-type')).toHaveValue('mortgage');
  }

  await page.getByTestId('item-name').fill(input.name);
  await page.getByTestId('item-type').selectOption(input.type);
  await page.getByTestId('item-amount').fill(input.amount);
  await page.getByTestId('save-item').click();
  await expect(page.getByText(input.name, { exact: true })).toBeVisible();
}
