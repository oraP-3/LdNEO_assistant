import { defaultRoles, tiles } from '../../assets/js/data.js';

const SCHEMA_VERSION = '1.0';
const MAX_QUERIES = 20;
const MAX_MATCHES = 10;

export function normalizeTileQuery(value) {
  return String(value).normalize('NFKC').toLowerCase().replace(/[\s\u3000・･]/gu, '');
}

function publicTile(tile, matchType) {
  return {
    id:tile.id,
    name:tile.name,
    series:tile.series,
    type:tile.type,
    characterId:tile.characterId ?? null,
    grade:tile.grade ?? null,
    unit:tile.unit ?? null,
    birthMonth:tile.birthMonth ?? null,
    hasSpecial:tile.hasSpecial ?? false,
    matchType
  };
}

function rankTile(tile, query, normalizedQuery) {
  const normalizedId = normalizeTileQuery(tile.id);
  if (normalizedId === normalizedQuery) return { rank:1, matchType:'exactId' };
  const normalizedName = normalizeTileQuery(tile.name);
  const normalizedCharacterId = tile.characterId == null ? '' : normalizeTileQuery(tile.characterId);
  if (normalizedName === normalizedQuery) return { rank:2, matchType:'exactName' };
  if (normalizedCharacterId === normalizedQuery) return { rank:3, matchType:'exactCharacterId' };
  if (normalizedName.startsWith(normalizedQuery)) return { rank:4, matchType:'prefixName' };
  if (normalizedName.includes(normalizedQuery)) return { rank:5, matchType:'partialName' };
  const searchable = [tile.characterId, tile.unit, tile.series].filter(value => value != null).map(normalizeTileQuery);
  if (searchable.some(value => value.includes(normalizedQuery))) return { rank:6, matchType:'partialMetadata' };
  return null;
}

export function validateResolveTilesRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { code:'INVALID_REQUEST', field:'body', value:null, message:'Request body must be an object.' };
  if (input.schemaVersion !== SCHEMA_VERSION) return { code:'UNSUPPORTED_SCHEMA_VERSION', field:'schemaVersion', value:input.schemaVersion ?? null, message:'Only schemaVersion 1.0 is supported.' };
  if (!Array.isArray(input.queries)) return { code:'INVALID_QUERIES', field:'queries', value:null, message:'queries must be an array.' };
  if (input.queries.length < 1 || input.queries.length > MAX_QUERIES) return { code:'INVALID_QUERIES', field:'queries', value:input.queries.length, message:'queries must contain between 1 and 20 items.' };
  for (let i = 0; i < input.queries.length; i += 1) {
    const query = input.queries[i];
    if (typeof query !== 'string') return { code:'INVALID_QUERY', field:`queries[${i}]`, value:null, message:'Each query must be a string.' };
    if (query.length === 0) return { code:'INVALID_QUERY', field:`queries[${i}]`, value:'', message:'Each query must not be empty.' };
    if (query.length > 100) return { code:'INVALID_QUERY', field:`queries[${i}]`, value:query, message:'Each query must be 100 characters or fewer.' };
    if (normalizeTileQuery(query).length === 0) return { code:'INVALID_QUERY', field:`queries[${i}]`, value:query, message:'Each query must contain searchable text.' };
  }
  return null;
}

export function resolveTiles(input) {
  try {
    const error = validateResolveTilesRequest(input);
    if (error) return { schemaVersion:SCHEMA_VERSION, ok:false, results:[], errors:[error] };
    return {
      schemaVersion:SCHEMA_VERSION,
      ok:true,
      results:input.queries.map(query => {
        const normalizedQuery = normalizeTileQuery(query);
        const matches = tiles.map(tile => ({ tile, match:rankTile(tile, query, normalizedQuery) }))
          .filter(item => item.match)
          .sort((a, b) => a.match.rank - b.match.rank || a.tile.id.localeCompare(b.tile.id, 'en', { numeric:true }))
          .slice(0, MAX_MATCHES)
          .map(item => publicTile(item.tile, item.match.matchType));
        return { query, normalizedQuery, matches };
      }),
      errors:[]
    };
  } catch (error) {
    return { schemaVersion:SCHEMA_VERSION, ok:false, results:[], errors:[{ code:'CATALOG_FAILED', field:'body', value:null, message:'Failed to resolve tiles.' }] };
  }
}

export function listRoles() {
  return {
    schemaVersion:SCHEMA_VERSION,
    ok:true,
    roles:[...defaultRoles].sort((a, b) => a.id.localeCompare(b.id)).map(role => ({
      id:role.id,
      name:role.name,
      score:role.score,
      category:role.category,
      group:role.group,
      enabledByDefault:role.enabledByDefault ?? true,
      ruleType:role.rule?.type ?? null
    })),
    errors:[]
  };
}
