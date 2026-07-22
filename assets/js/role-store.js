import { defaultRoles } from './data.js';
import { validateCustomRole } from './role-engine.js';

export const STORAGE_KEY = 'ldneo.roleSettings.v1';
export const SETTINGS_VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createDefaultSettings() {
  return { version:SETTINGS_VERSION, disabledRoleIds:[], customRoles:[] };
}

export function sanitizeSettings(raw, tiles) {
  const fallback = createDefaultSettings();
  if (!raw || typeof raw !== 'object') return fallback;
  const disabledRoleIds = Array.isArray(raw.disabledRoleIds)
    ? [...new Set(raw.disabledRoleIds.filter(id => typeof id === 'string'))]
    : [];
  const customRoles = [];
  const candidates = Array.isArray(raw.customRoles) ? raw.customRoles : [];
  for (const candidate of candidates) {
    const normalized = normalizeCustomRole(candidate);
    const validation = validateCustomRole(normalized,tiles,[...defaultRoles,...customRoles]);
    if (validation.valid) customRoles.push(normalized);
  }
  return { version:SETTINGS_VERSION, disabledRoleIds, customRoles };
}

export function loadSettings(tiles) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSettings();
    return sanitizeSettings(JSON.parse(raw),tiles);
  } catch (error) {
    console.warn('役設定の読み込みに失敗しました。初期設定を使用します。',error);
    return createDefaultSettings();
  }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));
}

export function resetSettings() {
  localStorage.removeItem(STORAGE_KEY);
  return createDefaultSettings();
}

export function getAllRoles(settings) {
  return [...defaultRoles,...(settings.customRoles || [])];
}

export function setRoleEnabled(settings,roleId,enabled) {
  const disabled = new Set(settings.disabledRoleIds || []);
  if (enabled) disabled.delete(roleId);
  else disabled.add(roleId);
  settings.disabledRoleIds = [...disabled];
  return settings;
}

export function isEnabled(settings,roleId) {
  return !(settings.disabledRoleIds || []).includes(roleId);
}

export function generateCustomRoleId() {
  if (globalThis.crypto?.randomUUID) return `custom_${globalThis.crypto.randomUUID()}`;
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
}

export function normalizeCustomRole(role) {
  const category = role?.category === 'standalone' ? 'standalone' : 'bonus';
  const id = typeof role?.id === 'string' && role.id.startsWith('custom_') ? role.id : generateCustomRoleId();
  const base = {
    id,
    name:String(role?.name || '').trim(),
    score:Number(role?.score),
    category,
    group:category === 'standalone' ? 'special' : 'custom',
    builtIn:false,
    enabledByDefault:true
  };
  if (category === 'standalone') {
    return {
      ...base,
      rule:{ type:'exactHand', requiredTileIds:[...new Set(role?.rule?.requiredTileIds || [])] }
    };
  }
  const requiredKeys = [...new Set(role?.rule?.requiredKeys || [])];
  const requiredCount = Number(role?.rule?.requiredCount || requiredKeys.length);
  return {
    ...base,
    rule:{ type:'fixedSet', keyType:'tileId', requiredKeys, requiredCount }
  };
}

export function upsertCustomRole(settings,role) {
  const normalized = normalizeCustomRole(role);
  const index = settings.customRoles.findIndex(item => item.id === normalized.id);
  if (index >= 0) settings.customRoles[index] = normalized;
  else settings.customRoles.push(normalized);
  return normalized;
}

export function deleteCustomRole(settings,roleId) {
  settings.customRoles = settings.customRoles.filter(role => role.id !== roleId);
  settings.disabledRoleIds = settings.disabledRoleIds.filter(id => id !== roleId);
}

export function duplicateCustomRole(settings,roleId) {
  const source = settings.customRoles.find(role => role.id === roleId);
  if (!source) return null;
  const copy = clone(source);
  copy.id = generateCustomRoleId();
  copy.name = `${copy.name}（コピー）`;
  settings.customRoles.push(copy);
  return copy;
}

export function exportSettings(settings) {
  return JSON.stringify({
    version:SETTINGS_VERSION,
    disabledRoleIds:[...(settings.disabledRoleIds || [])],
    customRoles:clone(settings.customRoles || [])
  },null,2);
}

export function importSettings(jsonText,tiles) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('JSONの形式が正しくありません。');
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.customRoles)) {
    throw new Error('役設定ファイルの形式が正しくありません。');
  }
  const normalized = { version:SETTINGS_VERSION, disabledRoleIds:[], customRoles:[] };
  normalized.disabledRoleIds = Array.isArray(parsed.disabledRoleIds)
    ? [...new Set(parsed.disabledRoleIds.filter(id => typeof id === 'string'))]
    : [];
  for (const candidate of parsed.customRoles) {
    const role = normalizeCustomRole(candidate);
    const validation = validateCustomRole(role,tiles,[...defaultRoles,...normalized.customRoles]);
    if (!validation.valid) throw new Error(`「${role.name || '名称未設定'}」: ${validation.message}`);
    normalized.customRoles.push(role);
  }
  return normalized;
}
