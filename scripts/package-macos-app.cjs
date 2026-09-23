const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDirectory = path.resolve(root, process.env.NEST_PACKAGE_OUTPUT || 'release-macos');
const builderCli = require.resolve('electron-builder/out/cli/cli.js');
const expectedArchitectures = ['x64', 'arm64'];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`macOS application package build failed with exit code ${code}`)));
  });
}

function macArchivePaths() {
  if (!fs.existsSync(outputDirectory)) return [];
  return fs.readdirSync(outputDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /-macOS-(x64|arm64)\.(dmg|zip)$/i.test(entry.name))
    .map(entry => path.join(outputDirectory, entry.name));
}

async function waitForStableArchives() {
  const deadline = Date.now() + 120000;
  let previous = new Map();
  let stableChecks = 0;
  while (Date.now() < deadline) {
    const archives = macArchivePaths();
    const current = new Map(archives.map(file => [file, fs.statSync(file).size]));
    const complete = expectedArchitectures.every(arch => ['dmg', 'zip'].every(extension => archives.some(file => file.endsWith(`-macOS-${arch}.${extension}`))))
      && [...current.values()].every(size => size >= 100 * 1024 * 1024);
    const unchanged = complete && current.size === previous.size && [...current].every(([file, size]) => previous.get(file) === size);
    stableChecks = unchanged ? stableChecks + 1 : 0;
    previous = current;
    if (complete && stableChecks >= 2) {
      for (const file of archives.sort()) {
        console.log(`Verified macOS application archive: ${file} (${Math.round(fs.statSync(file).size / 1024 / 1024)} MB)`);
      }
      return archives;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`macOS application archives were not completed within 120 seconds: ${outputDirectory}`);
}

(async () => {
  await run(process.execPath, [builderCli, '--mac', 'dmg', 'zip', '--x64', '--arm64', '--publish', 'never', `--config.directories.output=${outputDirectory}`]);
  await waitForStableArchives();
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
