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

    await expect(page.getByTestId('net-worth')).toContainText('$0');

    await createItem(page, {
      name: '示範銀行存款',
      type: 'bank_deposit',
      amount: '1000000',
    });
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
      '$9,000,000',
    );
    await expect(page.getByTestId('total-liabilities')).toContainText(
      '$5,000,000',
    );
    await expect(page.getByTestId('net-worth')).toContainText(
      '$4,000,000',
    );

    const mortgageRow = page
      .getByText('示範房貸', { exact: true })
      .locator('..')
      .locator('..');
    await mortgageRow.getByRole('button', { name: '編輯' }).click();
    await page.getByTestId('item-amount').fill('4900000');
    await page.getByTestId('save-item').click();

    await expect(page.getByTestId('net-worth')).toContainText(
      '$4,100,000',
    );

    await application.close();
    application = await launchApplication(userDataDirectory);
    page = await application.firstWindow();

    await expect(page.getByTestId('net-worth')).toContainText(
      '$4,100,000',
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
    page.once('dialog', (dialog) => dialog.accept());
    await propertyRow.getByRole('button', { name: '停用' }).click();

    await expect(
      page.getByText('示範房產', { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByTestId('total-assets')).toContainText(
      '$1,000,000',
    );
    await expect(page.getByTestId('total-liabilities')).toContainText(
      '$4,900,000',
    );
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
    await page.getByRole('button', { name: '負債' }).click();
  }

  await page.getByTestId('item-name').fill(input.name);
  await page.getByTestId('item-type').selectOption(input.type);
  await page.getByTestId('item-amount').fill(input.amount);
  await page.getByTestId('save-item').click();
  await expect(page.getByText(input.name, { exact: true })).toBeVisible();
}
