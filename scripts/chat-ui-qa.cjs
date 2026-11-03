const { _electron: electron } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { startChatServer } = require('../electron/lan-chat-server.cjs');
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-chat-ui-'));
  const server = await startChatServer({ directory: path.join(root, 'server'), host: '0.0.0.0', port: 0 });
  const apps = [], errors = [];
  try {
    const url = `http://${process.env.NEST_QA_HOST || '127.0.0.1'}:${server.address().port}`;
    for (const name of ['甲', '乙']) {
      const env = { ...process.env, NEST_QA_PROFILE: path.join(root, name), NEST_USER_DATA_DIR: path.join(root, name) }; delete env.ELECTRON_RUN_AS_NODE;
      const app = await electron.launch({ executablePath: process.env.ELECTRON_PATH, args: process.env.NEST_PACKAGED_QA ? [] : [path.join(__dirname, 'chat-qa-bootstrap.cjs')], env });
      apps.push(app); const page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
      const library = path.join(root, 'library-' + name); fs.mkdirSync(library);
      await app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }); }, library);
      await page.getByRole('button', { name: '创建资源库', exact: true }).click();
      await page.getByRole('button', { name: '聊天', exact: true }).click();
      await page.getByLabel('服务地址').fill(url); await page.getByLabel('你的昵称').fill('界面' + name); await page.getByRole('button', { name: '加入聊天', exact: true }).click();
      await page.getByLabel('聊天消息').waitFor();
    }
    const a = await apps[0].firstWindow(), b = await apps[1].firstWindow();
    await a.getByLabel('聊天消息').fill('公共群界面验证'); await a.getByRole('button', { name: '发送', exact: true }).click();
    await b.getByText('公共群界面验证', { exact: true }).waitFor();
    await b.getByRole('button', { name: '关闭聊天', exact: true }).click();
    await a.getByRole('button', { name: /界面乙/ }).click();
    await a.getByLabel('聊天消息').fill('私聊未读验证'); await a.getByRole('button', { name: '发送', exact: true }).click();
    await b.locator('.lan-badge').waitFor();
    await b.locator('button[title="办公室局域网聊天"]').click(); await b.getByRole('button', { name: /界面甲/ }).click();
    await b.getByText('私聊未读验证', { exact: true }).waitFor();
    const png = path.join(root, '图片.png'); fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64'));
    await apps[0].evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, png);
    await a.getByRole('button', { name: '图片 / 文件', exact: true }).click();
    await b.getByRole('button', { name: '查看图片', exact: true }).click();
    await b.locator('.lan-preview img').waitFor(); assert.equal(await b.locator('.lan-preview img').evaluate(img => img.complete && img.naturalWidth > 0), true);
    await b.getByRole('button', { name: '关闭图片', exact: true }).click();
    const downloaded = path.join(root, 'received.png');
    await apps[1].evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => { await new Promise(resolve => setTimeout(resolve, 6000)); return { canceled: false, filePath: file }; }; }, downloaded);
    await b.getByRole('button', { name: '保存附件', exact: true }).click();
    await b.waitForTimeout(3500);
    assert.equal(await b.getByLabel('聊天消息').count(), 1, 'chat must survive polling while save dialog is open');
    assert.deepEqual(errors, [], 'busy response must not crash renderer');
    await b.waitForFunction(() => !document.querySelector('.lan-progress'));
    assert.deepEqual(fs.readFileSync(downloaded), fs.readFileSync(png));
    await b.screenshot({ path: path.join(__dirname, '..', 'chat-ui-qa.png') });
    await a.getByLabel('聊天消息').fill('1');
    await a.getByRole('button', { name: '发送', exact: true }).click();
    await a.locator('.lan-message-bubble').getByText('1', { exact: true }).waitFor();
    await a.screenshot({ path: path.join(__dirname, '..', 'chat-bubbles-qa.png') });
    assert.deepEqual(errors, []); console.log('PASS: two Electron clients, public/private UI messaging, unread badge, image preview and attachment download; no renderer errors');
  } finally { for (const app of apps) await app.close(); await new Promise(r => server.close(r)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
