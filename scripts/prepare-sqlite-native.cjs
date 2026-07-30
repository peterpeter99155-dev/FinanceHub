const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const packageDirectory = path.join(
  projectRoot,
  'node_modules',
  'better-sqlite3-multiple-ciphers',
);
const prebuildInstaller = path.join(
  projectRoot,
  'node_modules',
  'prebuild-install',
  'bin.js',
);
const runtime = process.argv[2];

if (runtime !== 'node' && runtime !== 'electron') {
  throw new Error('Expected native runtime to be node or electron.');
}

const projectPackage = require(path.join(projectRoot, 'package.json'));
const target =
  runtime === 'electron'
    ? projectPackage.devDependencies.electron
    : process.versions.node;
const result = spawnSync(
  process.execPath,
  [
    prebuildInstaller,
    '--runtime',
    runtime,
    '--target',
    target,
    '--platform',
    process.platform,
    '--arch',
    process.arch,
    '--force',
  ],
  {
    cwd: packageDirectory,
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(
    `No prebuilt ${runtime} SQLite binary was available.`,
  );
}
