const { _electron: electron } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-ai-conversation-'));
  const env = { ...process.env, NEST_QA_PROFILE: root, NEST_USER_DATA_DIR: root };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.ELECTRON_PATH,
    args: [path.join(__dirname, 'chat-qa-bootstrap.cjs')],
    env,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const library = path.join(root, 'library');
    fs.mkdirSync(library);
    await app.evaluate(({ dialog, ipcMain }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
      ipcMain.removeHandler('ai:start-task');
      ipcMain.removeHandler('ai:task');
      ipcMain.handle('ai:start-task', async () => ({ id: 'qa-chat-task' }));
      ipcMain.handle('ai:task', async () => ({
        status: 'completed',
        result: { result: { message: '这是素材助手的测试回复。' } },
      }));
    }, library);
    await page.getByRole('button', { name: '创建资源库', exact: true }).click();
    await page.locator('button[title="AI 助手"]').click();
    await page.getByLabel('AI 对话记录').waitFor();
    const input = page.getByPlaceholder('问问你的素材库…');
    await input.fill('帮我看看这批素材');
    await input.press('Enter');
    await page.locator('.ai-message.user').getByText('帮我看看这批素材', { exact: true }).waitFor();
    await page.locator('.ai-message.assistant').getByText('这是素材助手的测试回复。', { exact: true }).waitFor();
    assert.equal(await input.inputValue(), '');
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(__dirname, '..', 'ai-conversation-ui-qa.png') });
    console.log('PASS: user and assistant bubbles, Enter send, cleared input, no renderer errors');
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
