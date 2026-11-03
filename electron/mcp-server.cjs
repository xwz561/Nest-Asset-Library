#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { readJson } = require('./json-storage.cjs');
const { TOOL_DEFINITIONS, runMcpTool } = require('./mcp-tools.cjs');

const libraryRoot = process.argv.find(value => value.startsWith('--library='))?.slice(10);
const permissions = (process.argv.find(value => value.startsWith('--permissions='))?.slice(14) || 'library.read').split(',').filter(Boolean);
const indexPath = libraryRoot ? path.join(path.resolve(libraryRoot), '.nest-library.json') : '';
const send = payload => process.stdout.write(`${JSON.stringify(payload)}\n`);
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
  let request;
  try { request = JSON.parse(line); } catch { return fail(null, -32700, 'Parse error'); }
  const { id, method, params = {} } = request;
  if (method === 'initialize') return reply(id, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'small-wangzai-asset-library', version: '1.0.0' } });
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') return reply(id, { tools: TOOL_DEFINITIONS.filter(tool => permissions.includes(tool.permission)).map(tool => ({ name: tool.name, description: tool.description, inputSchema: { type: 'object', additionalProperties: true } })) });
  if (method !== 'tools/call') return fail(id, -32601, 'Method not found');
  if (!indexPath || !fs.existsSync(indexPath)) return fail(id, -32001, 'Library not found');
  try {
    const data = readJson(indexPath);
    const result = runMcpTool(data, params.name, params.arguments || {}, permissions);
    if (result.error) return fail(id, -32002, result.error);
    return reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
  } catch (error) { return fail(id, -32000, error.message); }
});
