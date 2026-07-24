import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../worker/src/index.js';
import { openApiDocument } from '../worker/src/openapi.js';

const API_KEY = 'test-secret-key';
const ORIGIN = 'https://example.github.io';
const env = { ANALYSIS_API_KEY:API_KEY, ALLOWED_ORIGINS:ORIGIN };
const auth = { Authorization:`Bearer ${API_KEY}` };
const jsonHeaders = { ...auth, 'Content-Type':'application/json' };
const valid8 = { schemaVersion:'1.0', handTileIds:['t20','t12','t16','t35','t28','t45','t38','t39'] };
const valid9 = { schemaVersion:'1.0', handTileIds:['t01', ...valid8.handTileIds] };

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
  const text = await response.clone().text();
  assert.doesNotThrow(() => JSON.parse(text));
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

test('AnalysisResponseに8牌と9牌の実レスポンス項目を定義し、存在しないルート項目は定義しない', async () => {
  const doc = await body(await handleRequest(req('/openapi.json')));
  const schemas = doc.components.schemas;
  assert.deepEqual(schemas.AnalysisResponse.oneOf, [
    { $ref:'#/components/schemas/AnalysisWaitsResponse' },
    { $ref:'#/components/schemas/AnalysisDiscardResponse' }
  ]);
  assert.ok(schemas.AnalysisWaitsResponse.properties.input);
  assert.ok(schemas.AnalysisWaitsResponse.properties.waits);
  assert.ok(schemas.AnalysisDiscardResponse.properties.input);
  assert.ok(schemas.AnalysisDiscardResponse.properties.currentHand);
  assert.ok(schemas.AnalysisDiscardResponse.properties.discardCandidates);
  const serialized = JSON.stringify(schemas.AnalysisResponse);
  assert.equal(serialized.includes('normalizedInput'), false);
  assert.equal(serialized.includes('currentWin'), false);
  assert.equal(Object.hasOwn(schemas.AnalysisWaitsResponse.properties, 'winningTiles'), false);
  assert.equal(Object.hasOwn(schemas.AnalysisDiscardResponse.properties, 'winningTiles'), false);
});

test('8牌の実レスポンスとOpenAPIで定義した項目名が一致する', async () => {
  const doc = await body(await handleRequest(req('/openapi.json')));
  const response = await handleRequest(req('/analyze-position', { method:'POST', headers:jsonHeaders, body:JSON.stringify(valid8) }), env);
  const actualKeys = Object.keys(await body(response)).sort();
  const schemaKeys = doc.components.schemas.AnalysisWaitsResponse.required.toSorted();
  assert.deepEqual(actualKeys, schemaKeys);
});

test('9牌の実レスポンスとOpenAPIで定義した項目名が一致する', async () => {
  const doc = await body(await handleRequest(req('/openapi.json')));
  const response = await handleRequest(req('/analyze-position', { method:'POST', headers:jsonHeaders, body:JSON.stringify(valid9) }), env);
  const actualKeys = Object.keys(await body(response)).sort();
  const schemaKeys = doc.components.schemas.AnalysisDiscardResponse.required.toSorted();
  assert.deepEqual(actualKeys, schemaKeys);
});

test('TileMatchがallOfによるadditionalProperties矛盾を持たない', async () => {
  const doc = await body(await handleRequest(req('/openapi.json')));
  const tileMatch = doc.components.schemas.TileMatch;
  assert.equal(Object.hasOwn(tileMatch, 'allOf'), false);
  assert.equal(tileMatch.type, 'object');
  assert.equal(tileMatch.additionalProperties, false);
  assert.ok(tileMatch.properties.matchType);
});

test('schemaVersionはOpenAPI上でconst 1.0', async () => {
  const doc = await body(await handleRequest(req('/openapi.json')));
  assert.deepEqual(doc.components.schemas.ResolveTilesRequest.properties.schemaVersion, { const:'1.0' });
  assert.deepEqual(doc.components.schemas.AnalysisRequest.properties.schemaVersion, { const:'1.0' });
});

test('9牌の実レスポンスのseriesCompositionはobjectで各値にtotalとcharactersがある', async () => {
  const response = await handleRequest(req('/analyze-position', { method:'POST', headers:jsonHeaders, body:JSON.stringify(valid9) }), env);
  const json = await body(response);
  const composition = json.discardCandidates[0].seriesComposition;
  assert.equal(Array.isArray(composition), false);
  assert.equal(typeof composition, 'object');
  assert.notEqual(composition, null);
  for (const entry of Object.values(composition)) {
    assert.equal(Number.isInteger(entry.total), true);
    assert.equal(Number.isInteger(entry.characters), true);
  }
});

test('OpenAPIのSeriesCompositionとDiscardCandidate参照が実レスポンスに合っている', async () => {
  const doc = await body(await handleRequest(req('/openapi.json')));
  const schemas = doc.components.schemas;
  assert.equal(schemas.SeriesComposition.type, 'object');
  assert.deepEqual(schemas.SeriesComposition.additionalProperties, { $ref:'#/components/schemas/SeriesCompositionEntry' });
  assert.deepEqual(schemas.DiscardCandidate.properties.seriesComposition, { $ref:'#/components/schemas/SeriesComposition' });
  assert.equal(schemas.SeriesCompositionEntry.type, 'object');
  assert.deepEqual(schemas.SeriesCompositionEntry.required, ['total', 'characters']);
});


test('ChatGPT Actions互換のためtype objectスキーマはproperties objectを持つ', () => {
  const doc = openApiDocument();
  const schemas = doc.components.schemas;
  const failures = [];

  const visit = (node, path) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (node.type === 'object') {
      if (!Object.hasOwn(node, 'properties')) {
        failures.push(`${path}: properties missing`);
      } else if (!node.properties || typeof node.properties !== 'object' || Array.isArray(node.properties)) {
        failures.push(`${path}: properties is not object`);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      visit(value, `${path}.${key}`);
    }
  };

  visit(schemas, 'components.schemas');

  assert.deepEqual(failures, []);
  assert.deepEqual(schemas.AnalysisInput.properties.customRoles.items.properties, {});
  assert.deepEqual(schemas.AnalysisRequest.properties.customRoles.items.properties, {});
  assert.deepEqual(schemas.SeriesComposition.properties, {});
  assert.deepEqual(schemas.SeriesComposition.additionalProperties, { $ref:'#/components/schemas/SeriesCompositionEntry' });
});

test('AnalysisResponse.oneOfにErrorResponseを含まず、エラーステータスはErrorResponseを参照する', async () => {
  const doc = await body(await handleRequest(req('/openapi.json')));
  const oneOfRefs = doc.components.schemas.AnalysisResponse.oneOf.map(item => item.$ref);
  assert.deepEqual(oneOfRefs, [
    '#/components/schemas/AnalysisWaitsResponse',
    '#/components/schemas/AnalysisDiscardResponse'
  ]);
  assert.equal(oneOfRefs.includes('#/components/schemas/ErrorResponse'), false);
  for (const status of ['400', '401', '413', '415', '500', '503']) {
    assert.deepEqual(doc.paths['/analyze-position'].post.responses[status].content['application/json'].schema, { $ref:'#/components/schemas/ErrorResponse' });
  }
});
