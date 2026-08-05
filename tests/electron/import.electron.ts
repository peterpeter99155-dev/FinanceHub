import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  type ElectronApplication,
  type Page,
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
const packagedApplication = path.resolve(
  'out',
  'FinanceHub-win32-x64',
  'resources',
  'app.asar',
);
const fixtureDirectory = path.resolve('tests', 'fixtures', 'import');
const APP_PASSWORD = 'S5-Packaged-Import-Acceptance!';
const PDF_PASSWORD = 'FIXTURE-PDF-PASSWORD-7319';

test('packaged production bundle imports PDFs through preload and IPC', async () => {
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), 'financehub-packaged-import-'),
  );
  let application: ElectronApplication | undefined;

  try {
    application = await electron.launch({
      executablePath,
      args: [
        packagedApplication,
        `--user-data-dir=${userDataDirectory}`,
        '--disable-gpu',
      ],
    });
    const page = await application.firstWindow();
    await setupDatabase(page);
    await page.getByRole('button', { name: '帳單匯入' }).click();
    await page.getByRole('button', { name: '新增信用卡' }).click();
    await page.getByLabel('信用卡名稱').fill('虛構安裝驗收卡');
    await page.getByRole('button', { name: '建立並選取' }).click();

    await selectFixture(application, page, 'statement-acceptance-encrypted.pdf');
    await page.getByTestId('pdf-password').fill('wrong-pdf-password');
    await page.getByTestId('parse-statement').click();
    await expect(page.getByRole('alert')).toContainText('PDF 密碼不正確');
    await expect(page.getByTestId('pdf-password')).toHaveValue('');

    await selectFixture(application, page, 'statement-acceptance-encrypted.pdf');
    await page.getByTestId('pdf-password').fill(PDF_PASSWORD);
    await page.getByTestId('parse-statement').click();
    await expect(page.getByText(
      '帳單解析完成；一般項目可直接確認，需要時再展開修改。',
    )).toBeVisible();
    await expect(page.getByTestId('import-candidate')).toHaveCount(6);
    await expect(page.getByRole('heading', { name: '匯入紀錄' }))
      .toBeVisible();

    await selectFixture(application, page, 'statement-acceptance-encrypted.pdf');
    await page.getByTestId('pdf-password').fill(PDF_PASSWORD);
    await page.getByTestId('parse-statement').click();
    await expect(page.getByText('這份帳單先前已匯入，已顯示既有內容。'))
      .toBeVisible();
    await expect(page.getByTestId('import-candidate')).toHaveCount(6);

    await expectPdfFailure(
      application,
      page,
      'corrupt.pdf',
      'PDF 已損壞或不是有效的 PDF 檔案。',
    );
    await expectPdfFailure(
      application,
      page,
      'scanned.pdf',
      '目前不支援掃描型帳單',
    );
    await expectPdfFailure(
      application,
      page,
      'unsupported.pdf',
      '目前無法辨識這份信用卡帳單的版面。',
    );
  } finally {
    await application?.close();
    rmSync(userDataDirectory, { recursive: true, force: true });
  }
});

async function setupDatabase(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: '設定主密碼' }))
    .toBeVisible();
  await page.getByTestId('security-password').fill(APP_PASSWORD);
  await page.getByTestId('security-password-confirmation').fill(APP_PASSWORD);
  await page
    .getByLabel('我了解必須記住密碼，並一起備份兩個資料檔案')
    .check();
  await page.getByRole('button', { name: '建立加密資料庫' }).click();
  await expect(page.getByTestId('net-worth')).toBeVisible();
}

async function selectFixture(
  application: ElectronApplication,
  page: Page,
  fileName: string,
): Promise<void> {
  const selectedPath = path.join(fixtureDirectory, fileName);
  await application.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async (options) => {
      if (options.title !== '選擇信用卡月結帳單') {
        throw new Error(`Unexpected dialog: ${options.title}`);
      }
      return { canceled: false, filePaths: [filePath] };
    };
  }, selectedPath);
  await page.getByRole('button', { name: '選擇 PDF' }).click();
  await expect(page.getByText(fileName, { exact: true })).toBeVisible();
}

async function expectPdfFailure(
  application: ElectronApplication,
  page: Page,
  fileName: string,
  expectedMessage: string,
): Promise<void> {
  await selectFixture(application, page, fileName);
  await page.getByTestId('pdf-password').fill('one-time-only');
  await page.getByTestId('parse-statement').click();
  await expect(page.getByRole('alert')).toContainText(expectedMessage);
  await expect(page.getByTestId('pdf-password')).toHaveValue('');
}
