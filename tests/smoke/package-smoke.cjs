const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} = require('node:fs');
const { createServer } = require('node:net');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');

const executablePath = path.resolve(
  'out',
  'FinanceHub-win32-x64',
  'FinanceHub.exe',
);
const packagedAsarPath = path.resolve(
  'out',
  'FinanceHub-win32-x64',
  'resources',
  'app.asar',
);
const TEST_ONLY_PASSWORDS = [
  'S3 core fixed password only',
  'S3 core wrong password only',
  'S3 controller password only',
  'S3 Electron password only',
];

async function main() {
  if (!existsSync(executablePath)) {
    throw new Error(`Packaged executable was not found: ${executablePath}`);
  }

  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), 'financehub-package-smoke-'),
  );
  const debuggingPort = await findAvailablePort();
  const child = spawn(
    executablePath,
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

  let browser;
  try {
    browser = await connectToPackagedApp(debuggingPort);
    const contexts = browser.contexts();
    const page = contexts.flatMap((context) => context.pages())[0];
    if (!page) {
      throw new Error('Packaged app did not open a main window.');
    }

    await page.waitForLoadState('domcontentloaded');
    const title = await page.title();
    if (title !== 'FinanceHub') {
      throw new Error(`Unexpected main window title: ${title}`);
    }

    await page.getByText('FinanceHub', { exact: true }).waitFor();

    const lockedState = await page.evaluate(async () => {
      const status = await window.financeHub.getBootstrapStatus();
      let financialIpcFailed = false;
      try {
        await window.financeHub.financialItems.list();
      } catch {
        financialIpcFailed = true;
      }
      return { status, financialIpcFailed };
    });
    if (lockedState.status.databaseReady) {
      throw new Error('Packaged app reported an unlocked database.');
    }
    if (!lockedState.financialIpcFailed) {
      throw new Error('Financial IPC was callable before unlock.');
    }

    const databasePath = path.join(
      userDataDirectory,
      'financehub.db',
    );
    const metadataPath = `${databasePath}.metadata.json`;
    if (existsSync(databasePath) || existsSync(metadataPath)) {
      throw new Error(
        'Packaged app created financial storage before unlock.',
      );
    }

    const productionBundle = readFileSync(packagedAsarPath);
    const leakedTestPasswords = TEST_ONLY_PASSWORDS.filter((password) =>
      productionBundle.includes(Buffer.from(password, 'utf8')),
    );
    if (leakedTestPasswords.length > 0) {
      throw new Error(
        'A test-only password was included in the production bundle.',
      );
    }

    process.stdout.write(
      [
        'Package smoke passed.',
        `Executable: ${executablePath}`,
        `Main window title: ${title}`,
        'Database remained locked: true',
        'Financial IPC rejected before unlock: true',
        'Test-only passwords in production bundle: 0',
        '',
      ].join('\n'),
    );
  } finally {
    await browser?.close();
    child.kill();
    await waitForProcessExit(child, 5_000);
    rmSync(userDataDirectory, { recursive: true, force: true });
  }
}

async function connectToPackagedApp(port) {
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
