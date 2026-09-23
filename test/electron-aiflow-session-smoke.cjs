const assert = require('node:assert/strict');
const http = require('node:http');
const { app, BrowserWindow, session } = require('electron');

app.commandLine.appendSwitch('disable-gpu');

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (request.url === '/login') {
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Set-Cookie': 'sd2_session=smoke-session; Path=/; HttpOnly; SameSite=Lax',
        });
        response.end('<!doctype html><title>AI Flow login smoke</title>');
        return;
      }
      if (request.url === '/auth/me') {
        const authenticated = /(?:^|;\s*)sd2_session=smoke-session(?:;|$)/.test(request.headers.cookie || '');
        response.writeHead(authenticated ? 200 : 401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(authenticated
          ? { success: true, user: { id: 7, username: 'smoke-user', displayName: 'Smoke User' } }
          : { success: false, message: '未登录' }));
        return;
      }
      response.writeHead(404).end();
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function closeServer(server) {
  await new Promise(resolve => server.close(resolve));
}

app.whenReady().then(async () => {
  let server;
  let window;
  try {
    ({ server, baseUrl } = await startServer());
    const authSession = session.fromPartition(`aiflow-session-smoke-${process.pid}`, { cache: false });
    window = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, session: authSession },
    });
    await window.loadURL(`${baseUrl}/login`);
    const cookies = await authSession.cookies.get({ url: `${baseUrl}/` });
    assert.equal(cookies.some(cookie => cookie.name === 'sd2_session'), true, 'login page must populate the isolated session');
    const response = await authSession.fetch(`${baseUrl}/auth/me`, { credentials: 'include' });
    assert.equal(response.status, 200, 'session.fetch must send the account cookie');
    assert.equal((await response.json()).user.username, 'smoke-user');
    process.stdout.write('AI_FLOW_SESSION_SMOKE_PASS\n');
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    if (server) await closeServer(server);
    app.quit();
  }
});
