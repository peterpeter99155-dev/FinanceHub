const { existsSync, mkdtempSync, rmSync } = require('node:fs');
const { createServer } = require('node:net');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');

const installedExecutable = path.join(
  process.env.LOCALAPPDATA,
  'FinanceHub',
  'app-0.1.0',
  'FinanceHub.exe',
);
const TEST_PASSWORD = 'S3 installed acceptance password only';
const TEST_ITEM_NAME = '安裝驗收銀行';
const TEST_ITEM_AMOUNT = '24680';

async function main() {
  if (!existsSync(installedExecutable)) {
    throw new Error(
      `Installed FinanceHub executable was not found: ${installedExecutable}`,
    );
  }

  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), 'financehub-installed-acceptance-'),
  );

  try {
    const firstLaunch = await launchInstalledApp(userDataDirectory);
    try {
      const page = firstLaunch.page;
      await page
        .getByRole('heading', { name: '設定主密碼' })
        .waitFor();
      await page.getByTestId('security-password').fill(TEST_PASSWORD);
      await page
        .getByTestId('security-password-confirmation')
        .fill(TEST_PASSWORD);
      await page
        .getByLabel('我了解這兩種情況都無法復原資料')
        .check();
      await page
        .getByRole('button', { name: '建立加密資料庫' })
        .click();
      await page.getByTestId('net-worth').waitFor();

      await page.getByTestId('item-name').fill(TEST_ITEM_NAME);
      await page.getByTestId('item-amount').fill(TEST_ITEM_AMOUNT);
      await page.getByTestId('save-item').click();
      await page.getByText(TEST_ITEM_NAME, { exact: true }).waitFor();
      await assertText(page.getByTestId('net-worth'), 'TWD 24,680');
    } finally {
      await closeInstalledApp(firstLaunch);
    }

    const secondLaunch = await launchInstalledApp(userDataDirectory);
    try {
      const page = secondLaunch.page;
      await page
        .getByRole('heading', { name: '解鎖 FinanceHub' })
        .waitFor();
      if ((await page.getByText(/TWD/).count()) !== 0) {
        throw new Error('Financial amounts were visible before unlock.');
      }
      await page.getByTestId('security-password').fill(TEST_PASSWORD);
      await page.getByTestId('security-password').press('Enter');
      await page.getByText(TEST_ITEM_NAME, { exact: true }).waitFor();
      await assertText(page.getByTestId('net-worth'), 'TWD 24,680');
      await assertText(
        page.locator('.item-row').filter({
          hasText: TEST_ITEM_NAME,
        }),
        'TWD 24,680',
      );
    } finally {
      await closeInstalledApp(secondLaunch);
    }

    const databasePath = path.join(userDataDirectory, 'financehub.db');
    const metadataPath = `${databasePath}.metadata.json`;
    if (!existsSync(databasePath) || !existsSync(metadataPath)) {
      throw new Error(
        'Installed acceptance did not create both encrypted files.',
      );
    }

    process.stdout.write(
      [
        'Installed application acceptance passed.',
        `Executable: ${installedExecutable}`,
        'First launch: master password configured',
        `Created item: ${TEST_ITEM_NAME}, TWD 24,680`,
        'Application closed normally: true',
        'Second launch: locked screen shown before financial data',
        'Unlock succeeded: true',
        `Persisted item verified: ${TEST_ITEM_NAME}, TWD 24,680`,
        'Database and metadata sidecar both present: true',
        '',
      ].join('\n'),
    );
  } finally {
    rmSync(userDataDirectory, { recursive: true, force: true });
  }
}

async function launchInstalledApp(userDataDirectory) {
  const debuggingPort = await findAvailablePort();
  const child = spawn(
    installedExecutable,
    [
      `--user-data-dir=${userDataDirectory}`,
      `--remote-debugging-port=${debuggingPort}`,
      '--disable-gpu',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const browser = await connectToApp(debuggingPort);
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())[0];
  if (!page) {
    throw new Error('Installed FinanceHub did not open a main window.');
  }
  await page.waitForLoadState('domcontentloaded');
  return { browser, child, page };
}

async function closeInstalledApp(application) {
  await application.page.close();
  await application.browser.close();
  await waitForProcessExit(application.child, 10_000);
  if (application.child.exitCode === null) {
    application.child.kill();
    throw new Error('Installed FinanceHub did not exit after window close.');
  }
}

async function assertText(locator, expected) {
  const actual = await locator.textContent();
  if (!actual?.includes(expected)) {
    throw new Error(
      `Expected "${expected}" but received "${actual ?? ''}".`,
    );
  }
}

async function connectToApp(port) {
  const endpoint = `http://127.0.0.1:${port}`;
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await chromium.connectOverCDP(endpoint);
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError;
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a debugging port.'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForProcessExit(child, timeout) {
  if (child.exitCode !== null) {
    return;
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(timeout),
  ]);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
