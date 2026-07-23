import { tiles, defaultRoles } from './data.js';
import { checkMachi, evaluateHand, validateCustomRole } from './role-engine.js';
import { normalizeCustomRole } from './role-store.js';
import { analyzeDiscardCandidates } from './position-analyzer.js';

const SCHEMA_VERSION = '1.0';
const tileById = new Map(tiles.map(tile => [tile.id, tile]));

function error(code, field, value, message) {
  return { code, field, value:value === undefined ? null : value, message };
}

function failure(errors) {
  return { schemaVersion:SCHEMA_VERSION, ok:false, errors };
}

function tileSort(a, b) {
  return a.localeCompare(b, undefined, { numeric:true });
}

function roleSort(a, b) {
  return b.score - a.score || a.id.localeCompare(b.id);
}

function stableTile(tile) {
  return {
    id:tile.id,
    name:tile.name,
    series:tile.series,
    type:tile.type,
    grade:tile.grade,
    birthMonth:tile.birthMonth,
    hasSpecial:tile.hasSpecial
  };
}

function stableRole(role) {
  return {
    id:role.id,
    name:role.name,
    score:role.score,
    category:role.category,
    group:role.group
  };
}

function stableRoles(roles) {
  return [...roles].map(stableRole).sort(roleSort);
}

function stableSeriesComposition(composition) {
  return Object.fromEntries(Object.entries(composition).sort(([a], [b]) => a.localeCompare(b)));
}

function idsToTiles(ids) {
  return ids.map(id => tileById.get(id));
}

function findDuplicate(ids) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

function validateIdArray(input, field, errors, { required = false } = {}) {
  const value = input[field];
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) {
    errors.push(error('INVALID_FIELD', field, value, `${field} must be an array.`));
    return [];
  }
  const ids = value.map(item => String(item));
  const duplicate = findDuplicate(ids);
  if (duplicate) errors.push(error('DUPLICATE_TILE_ID', field, duplicate, `${field} contains a duplicate tile ID.`));
  for (const id of ids) {
    if (!tileById.has(id)) errors.push(error('UNKNOWN_TILE_ID', field, id, `${id} is not a known tile ID.`));
  }
  return ids;
}

function validateCustomRoles(value, errors) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(error('INVALID_CUSTOM_ROLES', 'customRoles', value, 'customRoles must be an array.'));
    return [];
  }
  const roles = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      errors.push(error('INVALID_CUSTOM_ROLE', 'customRoles', candidate, 'customRoles contains a non-object role.'));
      continue;
    }
    const normalized = normalizeCustomRole(candidate);
    const validation = validateCustomRole(normalized, tiles, [...defaultRoles, ...roles]);
    if (!validation.valid) {
      errors.push(error('INVALID_CUSTOM_ROLE', 'customRoles', normalized.id, validation.message));
      continue;
    }
    roles.push(normalized);
  }
  return roles.sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors:[error('INVALID_INPUT', 'input', input, 'input must be an object.')] };
  }
  if (input.schemaVersion !== SCHEMA_VERSION) {
    errors.push(error('UNSUPPORTED_SCHEMA_VERSION', 'schemaVersion', input.schemaVersion, 'Only schemaVersion 1.0 is supported.'));
  }

  const handTileIds = validateIdArray(input, 'handTileIds', errors, { required:true });
  const visibleTileIds = validateIdArray(input, 'visibleTileIds', errors);
  const thoughtTileIds = validateIdArray(input, 'thoughtTileIds', errors);
  if (handTileIds.length !== 8 && handTileIds.length !== 9) {
    errors.push(error('INVALID_HAND_TILE_COUNT', 'handTileIds', handTileIds.length, 'handTileIds must contain 8 or 9 tile IDs.'));
  }
  const visibleSet = new Set(visibleTileIds);
  for (const id of handTileIds) {
    if (visibleSet.has(id)) errors.push(error('DUPLICATE_TILE_ID_ACROSS_FIELDS', 'visibleTileIds', id, 'handTileIds and visibleTileIds must not overlap.'));
  }
  if (thoughtTileIds.length >= 3) {
    errors.push(error('TOO_MANY_THOUGHT_TILES', 'thoughtTileIds', thoughtTileIds.length, 'thoughtTileIds must contain at most 2 tile IDs.'));
  }

  const customRoles = validateCustomRoles(input.customRoles, errors);
  const knownRoleIds = new Set([...defaultRoles, ...customRoles].map(role => role.id));
  const disabledRoleIds = Array.isArray(input.disabledRoleIds) ? input.disabledRoleIds.map(String) : [];
  if (input.disabledRoleIds !== undefined && !Array.isArray(input.disabledRoleIds)) {
    errors.push(error('INVALID_FIELD', 'disabledRoleIds', input.disabledRoleIds, 'disabledRoleIds must be an array.'));
  }
  for (const id of disabledRoleIds) {
    if (!knownRoleIds.has(id)) errors.push(error('UNKNOWN_ROLE_ID', 'disabledRoleIds', id, `${id} is not a known role ID.`));
  }

  return {
    errors,
    normalizedInput:{
      schemaVersion:SCHEMA_VERSION,
      handTileIds:[...handTileIds].sort(tileSort),
      visibleTileIds:[...visibleTileIds].sort(tileSort),
      thoughtTileIds:[...thoughtTileIds].sort(tileSort),
      disabledRoleIds:[...new Set(disabledRoleIds)].sort(),
      customRoles:customRoles.map(stableRole),
      isOya:input.isOya === true
    },
    customRoles
  };
}

function buildContext(normalizedInput, customRoles) {
  return {
    roles:[...defaultRoles, ...customRoles],
    disabledRoleIds:new Set(normalizedInput.disabledRoleIds),
    isOya:normalizedInput.isOya,
    thoughtTiles:idsToTiles(normalizedInput.thoughtTileIds),
    tiles,
    visibleTiles:idsToTiles(normalizedInput.visibleTileIds)
  };
}

function stableWinningTile(item) {
  return {
    tile:stableTile(item.tile),
    finalHandTileIds:item.finalHand.map(tile => tile.id).sort(tileSort),
    totalScore:item.totalScore,
    matchedRoles:stableRoles(item.matchedRoles),
    isJunkara:item.isJunkara === true
  };
}

function analyzeWaits(handTiles, context) {
  const waits = checkMachi(handTiles, context);
  return {
    availableCount:waits.availableCount,
    totalCount:waits.count,
    groups:waits.groups.map(group => ({
      totalScore:group.score,
      matchedRoles:stableRoles(group.tiles[0] ? evaluateHand([...handTiles, group.tiles[0].tile], context).matchedRoles : []),
      winningTiles:group.tiles.map(item => ({ tile:stableTile(item.tile), isJunkara:item.isJunkara === true })).sort((a,b)=>tileSort(a.tile.id,b.tile.id))
    })).sort((a,b)=>b.totalScore-a.totalScore || a.matchedRoles.map(role=>role.id).join('|').localeCompare(b.matchedRoles.map(role=>role.id).join('|')))
  };
}

export function analyzePosition(input) {
  try {
    const { errors, normalizedInput, customRoles } = normalizeInput(input);
    if (errors.length > 0) return failure(errors);
    const handTiles = idsToTiles(normalizedInput.handTileIds);
    const context = buildContext(normalizedInput, customRoles);
    if (handTiles.length === 8) {
      return { schemaVersion:SCHEMA_VERSION, ok:true, input:normalizedInput, waits:analyzeWaits(handTiles, context), errors:[] };
    }
    const current = evaluateHand(handTiles, context);
    const discard = analyzeDiscardCandidates(handTiles, context);
    return {
      schemaVersion:SCHEMA_VERSION,
      ok:true,
      input:normalizedInput,
      currentHand:{ canAgari:current.canAgari, reason:current.reason, totalScore:current.totalScore, matchedRoles:stableRoles(current.matchedRoles) },
      discardCandidates:discard.candidates.map(candidate => ({
        discardTile:stableTile(candidate.discardTile),
        handAfterDiscardTileIds:handTiles.filter(tile => tile.id !== candidate.discardTile.id).map(tile => tile.id).sort(tileSort),
        seriesComposition:stableSeriesComposition(candidate.seriesComposition),
        availableWinningTileCount:candidate.availableWinningTileCount,
        isJunkara:candidate.isJunkara === true,
        winningTiles:candidate.winningTiles.map(stableWinningTile).sort((a,b)=>tileSort(a.tile.id,b.tile.id))
      })).sort((a,b)=>tileSort(a.discardTile.id,b.discardTile.id)),
      errors:[]
    };
  } catch (caught) {
    return failure([error('ANALYSIS_FAILED', 'input', null, caught instanceof Error ? caught.message : 'Analysis failed.')]);
  }
}
