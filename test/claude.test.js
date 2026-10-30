import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATS } from '../src/ledger.js';
import { claudeRequest, parseClaude, recognize } from '../src/claude.js';

test('claudeRequest headers and body', () => {
  const { url, init } = claudeRequest('QUJD', 'sk-test', CATS);
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, {
    'x-api-key': 'sk-test', 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
    'anthropic-dangerous-direct-browser-access': 'true' });
  const b = JSON.parse(init.body);
  assert.equal(b.model, 'claude-haiku-5-5');
  assert.equal(b.max_tokens, 4096);
  assert.equal(b.output_config.effort, 'low');
  assert.equal(b.output_config.format.type, 'json_schema');
  assert.equal('thinking' in b, false);
  assert.deepEqual(b.messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
  assert.equal(b.messages[0].content[1].type, 'text');
});

const ok = json => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(json) }] });

test('parseClaude success skips thinking blocks', () => {
  assert.deepEqual(parseClaude(200, ok({ a: 1 })), { ok: true, json: { a: 1 } });
});
test('parseClaude refusal', () => {
  assert.deepEqual(parseClaude(200, { stop_reason: 'refusal', content: [] }), { ok: false, error: 'REFUSAL' });
});
test('parseClaude max_tokens', () => {
  assert.deepEqual(parseClaude(200, { stop_reason: 'max_tokens', content: [] }), { ok: false, error: 'TRUNCATED' });
});
test('parseClaude http error', () => {
  assert.deepEqual(parseClaude(401, { error: { message: 'invalid x-api-key' } }), { ok: false, error: 'HTTP_401: invalid x-api-key' });
});
test('parseClaude broken json', () => {
  assert.deepEqual(parseClaude(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: '{oops' }] }), { ok: false, error: 'BAD_JSON' });
});
test('recognize uses injected fetch', async () => {
  const fetchFn = async () => ({ status: 200, json: async () => ok({ b: 2 }) });
  assert.deepEqual(await recognize('x', 'k', CATS, fetchFn), { ok: true, json: { b: 2 } });
});
test('recognize network failure', async () => {
  const fetchFn = async () => { throw new Error('offline'); };
  assert.deepEqual(await recognize('x', 'k', CATS, fetchFn), { ok: false, error: 'NETWORK: offline' });
});
