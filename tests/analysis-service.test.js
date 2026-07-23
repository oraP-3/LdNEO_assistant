import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePosition } from '../assets/js/analysis-service.js';

const ayumuBase8 = ['t20','t12','t16','t35','t28','t45','t38','t39'];
const aiBase8 = ['t12','t16','t20','t24','t27','t38','t43','t45'];
const customSpecial = ids => ({
  id:'custom_special_json',
  name:'JSON特殊役',
  score:900000,
  category:'standalone',
  rule:{ requiredTileIds:ids }
});
const customBonus = ids => ({
  id:'custom_bonus_json',
  name:'JSON加点役',
  score:90000,
  category:'bonus',
  rule:{ requiredKeys:ids, requiredCount:ids.length }
});

function roleIds(roles) {
  return roles.map(role => role.id);
}

test('8牌入力で待ち解析をJSONとして返せる', () => {
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:ayumuBase8 });
  assert.equal(result.ok, true);
  assert.equal(result.waits.totalCount > 0, true);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('9牌入力で9件の切り牌候補を返せる', () => {
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:['t01', ...ayumuBase8] });
  assert.equal(result.ok, true);
  assert.equal(result.discardCandidates.length, 9);
});

test('歩夢待ちで2年生＋AiScReamを同時に返す', () => {
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:['t01', ...ayumuBase8] });
  const discard = result.discardCandidates.find(candidate => candidate.discardTile.id === 't01');
  const ayumu = discard.winningTiles.find(item => item.tile.id === 't24');
  assert.ok(ayumu);
  assert.ok(roleIds(ayumu.matchedRoles).includes('bonus.grade.2'));
  assert.ok(roleIds(ayumu.matchedRoles).includes('bonus.unit.aiscream3'));
});

test('愛待ちで2年生＋DiverDivaを同時に返す', () => {
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:['t01', ...aiBase8] });
  const discard = result.discardCandidates.find(candidate => candidate.discardTile.id === 't01');
  const ai = discard.winningTiles.find(item => item.tile.id === 't28');
  assert.ok(ai);
  assert.ok(roleIds(ai.matchedRoles).includes('bonus.grade.2'));
  assert.ok(roleIds(ai.matchedRoles).includes('bonus.unit.diverdiva'));
});

test('最終9牌から外れた牌を属性役へ数えない', () => {
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:['t01','t12','t16','t20','t24','t25','t27','t38','t39'] });
  const discard = result.discardCandidates.find(candidate => candidate.discardTile.id === 't01');
  const wien = discard.winningTiles.find(item => item.tile.id === 't47');
  assert.ok(wien);
  assert.equal(wien.finalHandTileIds.includes('t01'), false);
  assert.equal(roleIds(wien.matchedRoles).includes('bonus.grade.2'), false);
});

test('visibleTileIdsを純カラ判定へ反映する', () => {
  const ids = ['t01','t12','t24','t38','t51','t61','t73','t10','t21'];
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:['t22', ...ids.slice(0, 8)], visibleTileIds:['t21'], customRoles:[customSpecial(ids)] });
  const discard = result.discardCandidates.find(candidate => candidate.discardTile.id === 't22');
  const logo = discard.winningTiles.find(item => item.tile.id === 't21');
  assert.equal(logo.isJunkara, true);
  assert.equal(discard.availableWinningTileCount, 0);
  assert.equal(discard.isJunkara, true);
});

test('disabledRoleIdsを反映する', () => {
  const handTileIds = ['t38','t39','t43','t46','t40','t41','t42','t44','t45'];
  const enabled = analyzePosition({ schemaVersion:'1.0', handTileIds });
  const disabled = analyzePosition({ schemaVersion:'1.0', handTileIds, disabledRoleIds:['bonus.unit.team_kodomo'] });
  assert.ok(roleIds(enabled.currentHand.matchedRoles).includes('bonus.unit.team_kodomo'));
  assert.equal(roleIds(disabled.currentHand.matchedRoles).includes('bonus.unit.team_kodomo'), false);
});

test('customRolesを反映する', () => {
  const handTileIds = ['t01','t02','t03','t12','t13','t14','t24','t25','t26'];
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds, customRoles:[customBonus(['t01','t02','t03'])] });
  assert.equal(result.ok, true);
  assert.ok(roleIds(result.currentHand.matchedRoles).includes('custom_bonus_json'));
});

test('不明な牌IDを構造化エラーとして返す', () => {
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:['t999', ...ayumuBase8] });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some(item => item.code === 'UNKNOWN_TILE_ID' && item.value === 't999'), true);
});

test('重複牌を構造化エラーとして返す', () => {
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:['t20', ...ayumuBase8] });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some(item => item.code === 'DUPLICATE_TILE_ID'), true);
});

test('JSON.stringifyとJSON.parseを往復できる', () => {
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:['t01', ...ayumuBase8] });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('同じ入力を2回解析すると同一結果になる', () => {
  const input = { schemaVersion:'1.0', handTileIds:['t01', ...ayumuBase8], visibleTileIds:['t24'] };
  assert.deepEqual(analyzePosition(input), analyzePosition(input));
});
