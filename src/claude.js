// Claude Messages API 영수증 인식. 정적 페이지라 SDK 대신 fetch로 직접 부른다.
import { receiptSchema, receiptPrompt } from './receipt.js';

export const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
export const CLAUDE_MODEL = 'claude-haiku-5-5';

export function claudeRequest(b64, apiKey, cats) {
  return { url: CLAUDE_URL, init: {
    method: 'POST',
    headers: {
      'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL, max_tokens: 4096,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: receiptSchema(cats) } },
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
        { type: 'text', text: receiptPrompt(cats) },
      ] }],
    }),
  } };
}

export function parseClaude(status, body) {
  if (status < 200 || status >= 300) return { ok: false, error: `HTTP_${status}: ${body?.error?.message || ''}`.trim() };
  if (body.stop_reason === 'refusal') return { ok: false, error: 'REFUSAL' };
  if (body.stop_reason === 'max_tokens') return { ok: false, error: 'TRUNCATED' };
  const text = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  try { return { ok: true, json: JSON.parse(text) }; } catch { return { ok: false, error: 'BAD_JSON' }; }
}

export async function recognize(b64, apiKey, cats, fetchFn = fetch) {
  const { url, init } = claudeRequest(b64, apiKey, cats);
  try {
    const res = await fetchFn(url, init);
    return parseClaude(res.status, await res.json().catch(() => ({})));
  } catch (e) {
    return { ok: false, error: `NETWORK: ${e.message}` };
  }
}
