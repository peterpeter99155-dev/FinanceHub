const { existsSync, mkdtempSync, rmSync } = require('node:fs');
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

    const databasePath = path.join(
      userDataDirectory,
      'financehub.dev.db',
    );
    await waitFor(() => existsSync(databasePath), 15_000);

    process.stdout.write(
      [
        'Package smoke passed.',
        `Executable: ${executablePath}`,
        `Main window title: ${title}`,
        `Database initialized: ${databasePath}`,
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

async function waitFor(predicate, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for packaged app state.');
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
