import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, analysisStatus } from '../worker/src/index.js';

const API_KEY = 'test-secret-key';
const ORIGIN = 'https://example.github.io';
const base8 = ['t20','t12','t16','t35','t28','t45','t38','t39'];
const valid8 = { schemaVersion:'1.0', handTileIds:base8 };
const valid9 = { schemaVersion:'1.0', handTileIds:['t01', ...base8] };

function req(path, options = {}) {
  return new Request(`https://api.example.test${path}`, options);
}

function post(body, headers = {}, env = { ANALYSIS_API_KEY:API_KEY }) {
  return handleRequest(req('/analyze-position', {
    method:'POST',
    headers:{ Authorization:`Bearer ${API_KEY}`, 'Content-Type':'application/json', ...headers },
    body
  }), env);
}

async function json(response) {
  return response.json();
}

async function assertJsonHeaders(response) {
  assert.match(response.headers.get('Content-Type'), /^application\/json; charset=utf-8/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  const text = await response.clone().text();
  assert.doesNotThrow(() => JSON.parse(text));
}

test('GET /healthが200で認証不要', async () => {
  const response = await handleRequest(req('/health'));
  assert.equal(response.status, 200);
  assert.deepEqual(await json(response.clone()), { ok:true, service:'ldneo-analysis-api', serviceVersion:'1.0', analysisSchemaVersion:'1.0' });
  await assertJsonHeaders(response);
});

test('/healthのGET以外が405でAllowがある', async () => {
  const response = await handleRequest(req('/health', { method:'POST' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET');
  await assertJsonHeaders(response);
});

test('未知パスが404', async () => {
  const response = await handleRequest(req('/missing'));
  assert.equal(response.status, 404);
  await assertJsonHeaders(response);
});

test('ANALYSIS_API_KEY未設定が503', async () => {
  const response = await post(JSON.stringify(valid8), {}, {});
  assert.equal(response.status, 503);
  await assertJsonHeaders(response);
});

test('Authorizationなしが401でWWW-Authenticateがある', async () => {
  const response = await handleRequest(req('/analyze-position', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(valid8) }), { ANALYSIS_API_KEY:API_KEY });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer');
  await assertJsonHeaders(response);
});

test('Bearer形式不正が401', async () => {
  const response = await handleRequest(req('/analyze-position', { method:'POST', headers:{ Authorization:API_KEY, 'Content-Type':'application/json' }, body:JSON.stringify(valid8) }), { ANALYSIS_API_KEY:API_KEY });
  assert.equal(response.status, 401);
  await assertJsonHeaders(response);
});

test('APIキー不一致が401', async () => {
  const response = await handleRequest(req('/analyze-position', { method:'POST', headers:{ Authorization:'Bearer wrong', 'Content-Type':'application/json' }, body:JSON.stringify(valid8) }), { ANALYSIS_API_KEY:API_KEY });
  assert.equal(response.status, 401);
  await assertJsonHeaders(response);
});

test('正しいAPIキーで8牌解析が200', async () => {
  const response = await post(JSON.stringify(valid8));
  assert.equal(response.status, 200);
  assert.equal((await json(response.clone())).ok, true);
  await assertJsonHeaders(response);
});

test('正しいAPIキーで9牌解析が200かつdiscardCandidatesが9件', async () => {
  const response = await post(JSON.stringify(valid9));
  const body = await json(response.clone());
  assert.equal(response.status, 200);
  assert.equal(body.discardCandidates.length, 9);
  await assertJsonHeaders(response);
});

test('analyzePositionの入力エラーが400', async () => {
  const response = await post(JSON.stringify({ schemaVersion:'1.0', handTileIds:['t999'] }));
  assert.equal(response.status, 400);
  assert.equal((await json(response.clone())).ok, false);
  await assertJsonHeaders(response);
});

test('JSON構文不正が400', async () => {
  const response = await post('{');
  assert.equal(response.status, 400);
  assert.equal((await json(response.clone())).errors[0].code, 'INVALID_JSON');
  await assertJsonHeaders(response);
});

test('空本文が400', async () => {
  const response = await post('');
  assert.equal(response.status, 400);
  assert.equal((await json(response.clone())).errors[0].code, 'EMPTY_BODY');
  await assertJsonHeaders(response);
});

test('Content-Type不正が415', async () => {
  const response = await post(JSON.stringify(valid8), { 'Content-Type':'text/plain' });
  assert.equal(response.status, 415);
  await assertJsonHeaders(response);
});

test('64KiB超過が413', async () => {
  const response = await post(JSON.stringify({ data:'x'.repeat(64 * 1024) }));
  assert.equal(response.status, 413);
  await assertJsonHeaders(response);
});

test('ANALYSIS_FAILEDが500になる', () => {
  assert.equal(analysisStatus({ ok:false, errors:[{ code:'ANALYSIS_FAILED' }] }), 500);
});

test('POST /analyze-position以外のメソッドが405でAllowがある', async () => {
  const response = await handleRequest(req('/analyze-position', { method:'GET' }), { ANALYSIS_API_KEY:API_KEY });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST, OPTIONS');
  await assertJsonHeaders(response);
});

test('許可OriginのOPTIONSが204でCORSヘッダーが付く', async () => {
  const response = await handleRequest(req('/analyze-position', { method:'OPTIONS', headers:{ Origin:ORIGIN } }), { ANALYSIS_API_KEY:API_KEY, ALLOWED_ORIGINS:ORIGIN });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type');
  assert.equal(response.headers.get('Vary'), 'Origin');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('不許可OriginのOPTIONSが403', async () => {
  const response = await handleRequest(req('/analyze-position', { method:'OPTIONS', headers:{ Origin:'https://evil.example' } }), { ANALYSIS_API_KEY:API_KEY, ALLOWED_ORIGINS:ORIGIN });
  assert.equal(response.status, 403);
  await assertJsonHeaders(response);
});

test('許可Originへ正しいCORSヘッダーが付く', async () => {
  const response = await post(JSON.stringify(valid8), { Origin:ORIGIN }, { ANALYSIS_API_KEY:API_KEY, ALLOWED_ORIGINS:ORIGIN });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(response.headers.get('Vary'), 'Origin');
});

test('Originなしのサーバー間通信が成功する', async () => {
  const response = await post(JSON.stringify(valid8));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('同じHTTP入力に同じJSONレスポンスを返す', async () => {
  const first = await post(JSON.stringify(valid9));
  const second = await post(JSON.stringify(valid9));
  assert.equal(await first.text(), await second.text());
});
