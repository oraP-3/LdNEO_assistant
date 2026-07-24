import { analyzePosition } from '../../assets/js/analysis-service.js';
import { listRoles, resolveTiles } from './catalog-service.js';
import { openApiDocument } from './openapi.js';

const SERVICE_VERSION = '1.0';
const SCHEMA_VERSION = '1.0';
const MAX_BODY_BYTES = 64 * 1024;

const JSON_HEADERS = {
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'
};

function errorBody(code, field, value, message) {
  return { schemaVersion:SCHEMA_VERSION, ok:false, errors:[{ code, field, value, message }] };
}

function jsonResponse(body, status = 200, request = null, env = {}, extraHeaders = {}) {
  if (request && isCorsForbidden(request, env)) return corsForbidden(request, env);
  const headers = new Headers(JSON_HEADERS);
  for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  applyCors(headers, request, env);
  return new Response(JSON.stringify(body), { status, headers });
}

function applyCors(headers, request, env) {
  if (!request) return;
  const origin = request.headers.get('Origin');
  if (!origin) return;
  headers.set('Vary', appendVary(headers.get('Vary'), 'Origin'));
  if (allowedOrigins(env).includes(origin)) headers.set('Access-Control-Allow-Origin', origin);
}

function appendVary(current, value) {
  if (!current) return value;
  return current.split(',').map(item => item.trim().toLowerCase()).includes(value.toLowerCase()) ? current : `${current}, ${value}`;
}

function allowedOrigins(env = {}) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);
}

function isCorsForbidden(request, env) {
  const origin = request.headers.get('Origin');
  return Boolean(origin && !allowedOrigins(env).includes(origin));
}

function corsForbidden(request, env, methods = null) {
  const extra = methods ? { 'Access-Control-Allow-Methods':methods, 'Access-Control-Allow-Headers':'Authorization, Content-Type' } : {};
  return jsonResponseRaw(errorBody('CORS_FORBIDDEN', 'Origin', request.headers.get('Origin') || null, 'Origin is not allowed.'), 403, request, env, extra);
}

function jsonResponseRaw(body, status = 200, request = null, env = {}, extraHeaders = {}) {
  const headers = new Headers(JSON_HEADERS);
  for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  applyCors(headers, request, env);
  return new Response(JSON.stringify(body), { status, headers });
}

function methodNotAllowed(allow, request, env) {
  return jsonResponse(errorBody('METHOD_NOT_ALLOWED', 'method', null, `Method not allowed. Use ${allow}.`), 405, request, env, { Allow:allow });
}

function analysisStatus(result) {
  if (result?.ok === true) return 200;
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  return errors.some(error => error?.code === 'ANALYSIS_FAILED') ? 500 : 400;
}

async function secureEquals(a, b) {
  const encoder = new TextEncoder();
  const [aDigest, bDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b))
  ]);
  const left = new Uint8Array(aDigest);
  const right = new Uint8Array(bDigest);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}

async function authenticate(request, env) {
  if (!env?.ANALYSIS_API_KEY) return { response:jsonResponse(errorBody('SERVICE_UNAVAILABLE', 'ANALYSIS_API_KEY', null, 'ANALYSIS_API_KEY is not configured.'), 503, request, env) };
  const authorization = request.headers.get('Authorization');
  if (!authorization) return { response:unauthorized(request, env) };
  const match = authorization.match(/^Bearer\s+(.+)$/);
  if (!match) return { response:unauthorized(request, env) };
  if (!(await secureEquals(match[1], env.ANALYSIS_API_KEY))) return { response:unauthorized(request, env) };
  return { ok:true };
}

function unauthorized(request, env) {
  return jsonResponse(errorBody('UNAUTHORIZED', 'Authorization', null, 'A valid Bearer token is required.'), 401, request, env, { 'WWW-Authenticate':'Bearer' });
}

async function parseJsonBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().split(';').map(part => part.trim()).includes('application/json')) {
    return { response:jsonResponse(errorBody('UNSUPPORTED_MEDIA_TYPE', 'Content-Type', contentType || null, 'Content-Type must be application/json.'), 415, request) };
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) return { response:jsonResponse(errorBody('PAYLOAD_TOO_LARGE', 'body', null, 'Request body must be 64KiB or smaller.'), 413, request) };
  if (buffer.byteLength === 0) return { response:jsonResponse(errorBody('EMPTY_BODY', 'body', null, 'Request body must not be empty.'), 400, request) };
  const text = new TextDecoder().decode(buffer);
  if (text.trim().length === 0) return { response:jsonResponse(errorBody('EMPTY_BODY', 'body', null, 'Request body must not be empty.'), 400, request) };
  try {
    return { body:JSON.parse(text) };
  } catch {
    return { response:jsonResponse(errorBody('INVALID_JSON', 'body', null, 'Request body must be valid JSON.'), 400, request) };
  }
}

function preflight(request, env, methods = 'POST, OPTIONS') {
  const origin = request.headers.get('Origin');
  const headers = new Headers(JSON_HEADERS);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', methods);
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (origin && allowedOrigins(env).includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    return new Response(null, { status:204, headers });
  }
  return jsonResponseRaw(errorBody('CORS_FORBIDDEN', 'Origin', origin || null, 'Origin is not allowed.'), 403, request, env, {
    'Access-Control-Allow-Methods':methods,
    'Access-Control-Allow-Headers':'Authorization, Content-Type'
  });
}

export async function handleRequest(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  if (url.pathname === '/health') {
    if (request.method !== 'GET') return methodNotAllowed('GET', request, env);
    return jsonResponse({ ok:true, service:'ldneo-analysis-api', serviceVersion:SERVICE_VERSION, analysisSchemaVersion:SCHEMA_VERSION }, 200, request, env);
  }
  if (url.pathname === '/openapi.json') {
    if (request.method !== 'GET') return methodNotAllowed('GET', request, env);
    return jsonResponse(openApiDocument(), 200, request, env, { 'Cache-Control':'public, max-age=300' });
  }
  if (url.pathname === '/resolve-tiles') {
    if (request.method === 'OPTIONS') return preflight(request, env, 'POST, OPTIONS');
    if (request.method !== 'POST') return methodNotAllowed('POST, OPTIONS', request, env);
    const auth = await authenticate(request, env);
    if (auth.response) return auth.response;
    const parsed = await parseJsonBody(request);
    if (parsed.response) return jsonResponse(await parsed.response.json(), parsed.response.status, request, env, Object.fromEntries(parsed.response.headers));
    const result = resolveTiles(parsed.body);
    return jsonResponse(result, result.ok ? 200 : 400, request, env);
  }
  if (url.pathname === '/roles') {
    if (request.method === 'OPTIONS') return preflight(request, env, 'GET, OPTIONS');
    if (request.method !== 'GET') return methodNotAllowed('GET, OPTIONS', request, env);
    const auth = await authenticate(request, env);
    if (auth.response) return auth.response;
    return jsonResponse(listRoles(), 200, request, env);
  }
  if (url.pathname === '/analyze-position') {
    if (request.method === 'OPTIONS') return preflight(request, env);
    if (request.method !== 'POST') return methodNotAllowed('POST, OPTIONS', request, env);
    const auth = await authenticate(request, env);
    if (auth.response) return auth.response;
    const parsed = await parseJsonBody(request);
    if (parsed.response) return jsonResponse(await parsed.response.json(), parsed.response.status, request, env, Object.fromEntries(parsed.response.headers));
    const result = analyzePosition(parsed.body);
    return jsonResponse(result, analysisStatus(result), request, env);
  }
  return jsonResponse(errorBody('NOT_FOUND', 'path', url.pathname, 'Path not found.'), 404, request, env);
}

export { analysisStatus };

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};
