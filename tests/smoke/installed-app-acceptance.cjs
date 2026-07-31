const {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
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
const TEST_PASSWORD = 'S3-Installed-Acceptance!';
const TEST_ITEM_NAME = '安裝驗收銀行';
const TEST_TRANSACTION_NOTE = '安裝驗收薪資';
const roots = [];

async function main() {
  if (!existsSync(installedExecutable)) {
    throw new Error(
      `Installed FinanceHub executable was not found: ${installedExecutable}`,
    );
  }

  const userDataDirectory = temporaryDirectory('financehub-installed-');
  let application = await launchInstalledApp(userDataDirectory);
  try {
    await setupDatabase(application.page);
    await createFinancialData(application.page);
    const firstAutomatic = await settledBackupStatus(application.page);
    assert(firstAutomatic.validBackupCount >= 1, 'First automatic backup missing.');

    await application.page
      .getByRole('button', { name: '資料與備份' })
      .click();
    await application.page.getByTestId('backup-now').click();
    const afterManual = await settledBackupStatus(application.page);
    assert(
      afterManual.validBackupCount === firstAutomatic.validBackupCount + 1,
      'Manual backup did not add exactly one valid backup.',
    );
    assert(
      afterManual.dataDirectory === userDataDirectory,
      'UI status did not expose the actual data directory.',
    );

    const backupsDirectory = path.join(userDataDirectory, 'backups');
    assertValidBackupDirectories(backupsDirectory);
    assertNoPlaintext(backupsDirectory, [
      TEST_ITEM_NAME,
      TEST_TRANSACTION_NOTE,
    ]);

    await application.page.evaluate(async () => {
      await window.financeHub.backups.setRetentionCount(7);
      let status = await window.financeHub.backups.getStatus();
      while (status.validBackupCount < 7) {
        status = await window.financeHub.backups.createNow();
      }
      await window.financeHub.backups.createNow();
    });
    const afterEighth = await settledBackupStatus(application.page);
    assert(afterEighth.validBackupCount === 7, 'Retention did not keep seven.');
    assert(backupDirectories(backupsDirectory).length === 7, 'Disk count is not seven.');

    const beforeRestartIds = backupDirectories(backupsDirectory);
    await closeInstalledApp(application);
    application = await launchInstalledApp(userDataDirectory);
    await unlockDatabase(application.page);
    const beforeDue = await settledBackupStatus(application.page);
    assert(beforeDue.validBackupCount === 7, 'Backup ran before 24 hours.');
    assertSameSet(
      beforeRestartIds,
      backupDirectories(backupsDirectory),
      'Backup set changed before 24 hours.',
    );

    await closeInstalledApp(application);
    ageBackupManifests(backupsDirectory);
    const agedIds = backupDirectories(backupsDirectory);
    application = await launchInstalledApp(userDataDirectory);
    await unlockDatabase(application.page);
    const afterDue = await settledBackupStatus(application.page);
    const afterDueIds = backupDirectories(backupsDirectory);
    assert(afterDue.validBackupCount === 7, 'Automatic retention count changed.');
    assert(
      afterDueIds.some((id) => !agedIds.includes(id)),
      'Unlock after 24 hours did not create one new automatic backup.',
    );

    await closeInstalledApp(application);
    application = undefined;
    const latestBackup = latestBackupDirectory(backupsDirectory);
    await verifyRestore(latestBackup);
    await verifyLiveFileRejection(latestBackup, 'database');
    await verifyLiveFileRejection(latestBackup, 'metadata');

    process.stdout.write(
      [
        'Installed Sprint 04 acceptance passed.',
        `Executable: ${installedExecutable}`,
        'Clean isolated setup and unlock: passed',
        'Financial item and transaction created: passed',
        'First automatic backup after unlock: passed',
        'Manual backup through UI: passed',
        'Backup triplet and plaintext scan: passed',
        'Before 24 hours no automatic backup: passed',
        'After 24 hours one automatic attempt: passed',
        'Eighth successful backup retained newest seven: passed',
        'README-style isolated restore: passed',
        'Restored item, transaction and net worth: passed',
        'Missing live database rejected: passed',
        'Missing live metadata rejected: passed',
        '',
      ].join('\n'),
    );
  } finally {
    await closeInstalledApp(application);
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

async function setupDatabase(page) {
  await page.getByRole('heading', { name: '設定主密碼' }).waitFor();
  await page.getByTestId('security-password').fill(TEST_PASSWORD);
  await page
    .getByTestId('security-password-confirmation')
    .fill(TEST_PASSWORD);
  await page
    .getByLabel('我了解必須記住密碼，並一起備份兩個資料檔案')
    .check();
  await page.getByRole('button', { name: '建立加密資料庫' }).click();
  await page.getByTestId('net-worth').waitFor();
}

async function createFinancialData(page) {
  await page.getByTestId('item-name').fill(TEST_ITEM_NAME);
  await page.getByTestId('item-amount').fill('24680');
  await page.getByTestId('save-item').click();
  await page.getByText(TEST_ITEM_NAME, { exact: true }).waitFor();
  await page.getByRole('button', { name: '收支紀錄' }).click();
  await page.getByTestId('transaction-kind').selectOption('income');
  await page.getByLabel('入帳帳戶（選填）').selectOption({ index: 1 });
  await page.getByTestId('transaction-category').selectOption('income-salary');
  await page.getByTestId('transaction-amount').fill('1234');
  await page.getByLabel('備註（選填）').fill(TEST_TRANSACTION_NOTE);
  await page.getByTestId('save-transaction').click();
  await page.getByText(`備註：${TEST_TRANSACTION_NOTE}`).waitFor();
  await page.getByRole('button', { name: '資產與負債' }).click();
  await assertText(page.getByTestId('net-worth'), 'TWD 25,914');
}

async function settledBackupStatus(page) {
  return page.evaluate(async () => {
    const status = await window.financeHub.backups.getStatus();
    return status.isRunning
      ? window.financeHub.backups.waitForCurrentBackup()
      : status;
  });
}

function assertValidBackupDirectories(backupsDirectory) {
  for (const name of backupDirectories(backupsDirectory)) {
    const directory = path.join(backupsDirectory, name);
    const entries = readdirSync(directory).sort();
    assertSameSet(
      entries,
      ['financehub.db', 'financehub.db.metadata.json', 'manifest.json'],
      `Backup ${name} is not an exact triplet.`,
    );
    const manifest = JSON.parse(
      readFileSync(path.join(directory, 'manifest.json'), 'utf8'),
    );
    assert(name.endsWith(manifest.backupId), 'ID mismatch.');
  }
}

function assertNoPlaintext(root, needles) {
  for (const directory of backupDirectories(root)) {
    for (const name of readdirSync(path.join(root, directory))) {
      if (!/financehub\.db(?:-wal|-shm|-journal)?$/.test(name)) continue;
      const bytes = readFileSync(path.join(root, directory, name));
      for (const needle of needles) {
        assert(
          !bytes.includes(Buffer.from(needle, 'utf8')),
          `Plaintext leaked into ${directory}/${name}.`,
        );
      }
    }
  }
}

function ageBackupManifests(backupsDirectory) {
  backupDirectories(backupsDirectory).forEach((name, index) => {
    const manifestPath = path.join(backupsDirectory, name, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.completedAt = new Date(
      Date.UTC(2020, 0, 1, 0, 0, index),
    ).toISOString();
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  });
}

function latestBackupDirectory(backupsDirectory) {
  return backupDirectories(backupsDirectory)
    .map((name) => {
      const directory = path.join(backupsDirectory, name);
      const manifest = JSON.parse(
        readFileSync(path.join(directory, 'manifest.json'), 'utf8'),
      );
      return { completedAt: manifest.completedAt, directory };
    })
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt))
    .at(-1).directory;
}

async function verifyRestore(backupDirectory) {
  const restoreRoot = temporaryDirectory('financehub-restore-');
  copyFileSync(
    path.join(backupDirectory, 'financehub.db'),
    path.join(restoreRoot, 'financehub.db'),
  );
  copyFileSync(
    path.join(backupDirectory, 'financehub.db.metadata.json'),
    path.join(restoreRoot, 'financehub.db.metadata.json'),
  );
  const restored = await launchInstalledApp(restoreRoot);
  try {
    await unlockDatabase(restored.page);
    await restored.page.getByText(TEST_ITEM_NAME, { exact: true }).waitFor();
    await assertText(restored.page.getByTestId('net-worth'), 'TWD 25,914');
    await restored.page.getByRole('button', { name: '收支紀錄' }).click();
    await restored.page.getByText(`備註：${TEST_TRANSACTION_NOTE}`).waitFor();
  } finally {
    await closeInstalledApp(restored);
  }
}

async function verifyLiveFileRejection(backupDirectory, missing) {
  const root = temporaryDirectory(`financehub-missing-${missing}-`);
  if (missing !== 'database') {
    copyFileSync(
      path.join(backupDirectory, 'financehub.db'),
      path.join(root, 'financehub.db'),
    );
  }
  if (missing !== 'metadata') {
    copyFileSync(
      path.join(backupDirectory, 'financehub.db.metadata.json'),
      path.join(root, 'financehub.db.metadata.json'),
    );
  }
  const application = await launchInstalledApp(root);
  try {
    await application.page.getByText('加密資料需要處理').waitFor();
  } finally {
    await closeInstalledApp(application);
  }
}

function backupDirectories(root) {
  return readdirSync(root)
    .filter((name) =>
      /^backup-[0-9a-f-]{36}$/i.test(name) ||
      /^FinanceHub-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-[0-9a-f-]{36}$/i
        .test(name),
    )
    .sort();
}

async function unlockDatabase(page) {
  await page.getByRole('heading', { name: '解鎖 FinanceHub' }).waitFor();
  if ((await page.getByText(/TWD/).count()) !== 0) {
    throw new Error('Financial amounts were visible before unlock.');
  }
  await page.getByTestId('security-password').fill(TEST_PASSWORD);
  await page.getByTestId('security-password').press('Enter');
  await page.getByTestId('net-worth').waitFor();
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
  const page = browser.contexts().flatMap((context) => context.pages())[0];
  if (!page) throw new Error('Installed app did not open a main window.');
  await page.waitForLoadState('domcontentloaded');
  return { browser, child, page };
}

async function closeInstalledApp(application) {
  if (!application) return;
  await application.page.close().catch(() => undefined);
  await application.browser.close().catch(() => undefined);
  await waitForProcessExit(application.child, 10_000);
  if (application.child.exitCode === null) {
    application.child.kill();
    throw new Error('Installed app did not exit after window close.');
  }
}

async function assertText(locator, expected) {
  const actual = await locator.textContent();
  assert(actual?.includes(expected), `Expected "${expected}", got "${actual}".`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSameSet(actual, expected, message) {
  assert(
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()),
    message,
  );
}

function temporaryDirectory(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
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
  if (child.exitCode !== null) return;
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
