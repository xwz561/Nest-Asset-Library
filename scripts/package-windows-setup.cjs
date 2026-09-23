const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDirectory = path.resolve(root, process.env.NEST_PACKAGE_OUTPUT || 'release');
const builderCli = require.resolve('electron-builder/out/cli/cli.js');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Windows installer build failed with exit code ${code}`)));
  });
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitForStableSetup() {
  const deadline = Date.now() + 120000;
  let previousPath = '';
  let previousSize = -1;
  let stableChecks = 0;
  while (Date.now() < deadline) {
    const candidates = fs.existsSync(outputDirectory)
      ? fs.readdirSync(outputDirectory, { withFileTypes: true })
        .filter(entry => entry.isFile() && /-Setup\.exe$/i.test(entry.name))
        .map(entry => path.join(outputDirectory, entry.name))
      : [];
    const setup = candidates.map(file => ({ file, stat: fs.statSync(file) }))
      .filter(item => item.stat.size >= 100 * 1024 * 1024)
      .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs)[0];
    if (setup && setup.file === previousPath && setup.stat.size === previousSize) stableChecks += 1;
    else { previousPath = setup?.file || ''; previousSize = setup?.stat.size || -1; stableChecks = 0; }
    if (setup && stableChecks >= 2) {
      console.log(`Verified Windows Setup installer: ${setup.file} (${Math.round(setup.stat.size / 1024 / 1024)} MB)`);
      return setup.file;
    }
    await sleep(1000);
  }
  throw new Error(`Setup installer was not completed within 120 seconds: ${outputDirectory}`);
}

(async () => {
  await run(process.execPath, [builderCli, '--win', 'nsis', '--publish', 'never', `--config.directories.output=${outputDirectory}`]);
  await waitForStableSetup();
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
