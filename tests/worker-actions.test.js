import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../worker/src/index.js';

const API_KEY = 'test-secret-key';
const ORIGIN = 'https://example.github.io';
const env = { ANALYSIS_API_KEY:API_KEY, ALLOWED_ORIGINS:ORIGIN };
const auth = { Authorization:`Bearer ${API_KEY}` };
const jsonHeaders = { ...auth, 'Content-Type':'application/json' };
const valid8 = { schemaVersion:'1.0', handTileIds:['t20','t12','t16','t35','t28','t45','t38','t39'] };

const req = (path, options = {}) => new Request(`https://api.example.test${path}`, options);
const body = response => response.json();

async function postResolve(payload, headers = jsonHeaders, requestEnv = env) {
  return handleRequest(req('/resolve-tiles', { method:'POST', headers, body:JSON.stringify(payload) }), requestEnv);
}

test('POST /resolve-tilesが認証必須', async () => {
  const response = await handleRequest(req('/resolve-tiles', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ schemaVersion:'1.0', queries:['上原歩夢'] }) }), env);
  assert.equal(response.status, 401);
});

test('正常なresolve-tilesが200', async () => {
  const response = await postResolve({ schemaVersion:'1.0', queries:['上原歩夢'] });
  assert.equal(response.status, 200);
  assert.equal((await body(response)).results[0].matches[0].id, 't24');
});

test('不正queriesが400', async () => {
  const response = await postResolve({ schemaVersion:'1.0', queries:[] });
  assert.equal(response.status, 400);
});

test('20件超過が400', async () => {
  const response = await postResolve({ schemaVersion:'1.0', queries:Array.from({ length:21 }, (_, i) => `t${i}`) });
  assert.equal(response.status, 400);
});

test('GET /rolesが認証必須', async () => {
  const response = await handleRequest(req('/roles'), env);
  assert.equal(response.status, 401);
});

test('rolesがid昇順', async () => {
  const response = await handleRequest(req('/roles', { headers:auth }), env);
  const json = await body(response);
  assert.equal(response.status, 200);
  assert.deepEqual(json.roles.map(role => role.id), [...json.roles.map(role => role.id)].sort());
});

test('GET /openapi.jsonが認証不要で有効なJSON', async () => {
  const response = await handleRequest(req('/openapi.json'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /^application\/json; charset=utf-8/);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.doesNotThrow(async () => JSON.parse(await response.clone().text()));
});

test('openapiが3.1.0でservers URLとoperationIdとbearerAuthを含む', async () => {
  const doc = await body(await handleRequest(req('/openapi.json')));
  assert.equal(doc.openapi, '3.1.0');
  assert.equal(doc.servers[0].url, 'https://ldneo-analysis-api.ldneo-tools.workers.dev');
  assert.equal(doc.paths['/resolve-tiles'].post.operationId, 'resolveTiles');
  assert.equal(doc.paths['/roles'].get.operationId, 'listRoles');
  assert.equal(doc.paths['/analyze-position'].post.operationId, 'analyzePosition');
  assert.deepEqual(doc.components.securitySchemes.bearerAuth, { type:'http', scheme:'bearer' });
});

test('OpenAPIに秘密値や対象外パスを含まない', async () => {
  const text = await (await handleRequest(req('/openapi.json'), { ANALYSIS_API_KEY:API_KEY })).text();
  assert.equal(text.includes(API_KEY), false);
  assert.equal(text.includes('ANALYSIS_API_KEY'), false);
  const doc = JSON.parse(text);
  assert.equal(Object.hasOwn(doc.paths, '/health'), false);
  assert.equal(Object.hasOwn(doc.paths, '/openapi.json'), false);
});

test('各エンドポイントの405とAllow', async () => {
  const cases = [['/resolve-tiles', 'GET', 'POST, OPTIONS'], ['/roles', 'POST', 'GET, OPTIONS'], ['/openapi.json', 'POST', 'GET']];
  for (const [path, method, allow] of cases) {
    const response = await handleRequest(req(path, { method }), env);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), allow);
  }
});

test('各エンドポイントのOPTIONS', async () => {
  const cases = [['/resolve-tiles', 'POST, OPTIONS'], ['/roles', 'GET, OPTIONS'], ['/analyze-position', 'POST, OPTIONS']];
  for (const [path, methods] of cases) {
    const response = await handleRequest(req(path, { method:'OPTIONS', headers:{ Origin:ORIGIN } }), env);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), methods);
  }
});

test('Originなしの通信が成功', async () => {
  const response = await postResolve({ schemaVersion:'1.0', queries:['t38'] }, jsonHeaders, { ANALYSIS_API_KEY:API_KEY });
  assert.equal(response.status, 200);
});

test('許可OriginのCORSが成功', async () => {
  const response = await postResolve({ schemaVersion:'1.0', queries:['t38'] }, { ...jsonHeaders, Origin:ORIGIN });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('不許可Originが403', async () => {
  const response = await postResolve({ schemaVersion:'1.0', queries:['t38'] }, { ...jsonHeaders, Origin:'https://evil.example' });
  assert.equal(response.status, 403);
});

test('既存/analyze-positionの挙動が変わっていない', async () => {
  const response = await handleRequest(req('/analyze-position', { method:'POST', headers:jsonHeaders, body:JSON.stringify(valid8) }), env);
  const json = await body(response);
  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.ok(Array.isArray(json.waits.groups));
});
