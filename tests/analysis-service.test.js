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

test('IDのないカスタム役を渡すとINVALID_CUSTOM_ROLE_IDになる', () => {
  const role = customBonus(['t01','t02','t03']);
  delete role.id;
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:['t01','t02','t03','t12','t13','t14','t24','t25','t26'], customRoles:[role] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors[0], {
    code:'INVALID_CUSTOM_ROLE_ID',
    field:'customRoles',
    value:null,
    message:'Custom roles require an explicit ID beginning with custom_.'
  });
});

test('custom_で始まらないIDを渡すとINVALID_CUSTOM_ROLE_IDになる', () => {
  const role = { ...customBonus(['t01','t02','t03']), id:'bonus_json' };
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:['t01','t02','t03','t12','t13','t14','t24','t25','t26'], customRoles:[role] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors[0], {
    code:'INVALID_CUSTOM_ROLE_ID',
    field:'customRoles',
    value:'bonus_json',
    message:'Custom roles require an explicit ID beginning with custom_.'
  });
});

test('不正IDの入力を2回解析しても完全に同じエラー結果になる', () => {
  const input = {
    schemaVersion:'1.0',
    handTileIds:['t01','t02','t03','t12','t13','t14','t24','t25','t26'],
    customRoles:[{ ...customBonus(['t01','t02','t03']), id:'invalid_json' }]
  };
  assert.deepEqual(analyzePosition(input), analyzePosition(input));
});

test('有効なカスタム役を含む同じ入力を2回解析すると完全に同じ結果になる', () => {
  const input = {
    schemaVersion:'1.0',
    handTileIds:['t01','t02','t03','t12','t13','t14','t24','t25','t26'],
    customRoles:[customBonus(['t03','t01','t02'])]
  };
  assert.deepEqual(analyzePosition(input), analyzePosition(input));
});

test('normalizedInput.customRolesに正規化済みruleが含まれる', () => {
  const specialIds = ['t21','t10','t73','t61','t51','t38','t24','t12','t01'];
  const result = analyzePosition({
    schemaVersion:'1.0',
    handTileIds:['t01','t02','t03','t12','t13','t14','t24','t25','t26'],
    customRoles:[customBonus(['t03','t01','t02']), customSpecial(specialIds)]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.input.customRoles.find(role => role.id === 'custom_bonus_json').rule, {
    type:'fixedSet',
    keyType:'tileId',
    requiredKeys:['t01','t02','t03'],
    requiredCount:3
  });
  assert.deepEqual(result.input.customRoles.find(role => role.id === 'custom_special_json').rule, {
    type:'exactHand',
    requiredTileIds:['t01','t10','t12','t21','t24','t38','t51','t61','t73']
  });
});

test('normalizedInputを利用して再度analyzePosition()を呼び、同じ解析結果を得られる', () => {
  const input = {
    schemaVersion:'1.0',
    handTileIds:['t01','t02','t03','t12','t13','t14','t24','t25','t26'],
    customRoles:[customBonus(['t03','t01','t02'])]
  };
  const result = analyzePosition(input);
  assert.deepEqual(analyzePosition(result.input), result);
});

test('カスタム役を含む結果もJSON.stringify / JSON.parseを往復できる', () => {
  const result = analyzePosition({
    schemaVersion:'1.0',
    handTileIds:['t01','t02','t03','t12','t13','t14','t24','t25','t26'],
    customRoles:[customBonus(['t03','t01','t02'])]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

function assertJsonRoundTrips(value) {
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
}

test('BigIntを含む不正入力でもJSON.stringifyできる', () => {
  const result = analyzePosition({ schemaVersion:1n, handTileIds:['t01'] });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].value, '1n');
  assertJsonRoundTrips(result);
});

test('functionを含む不正入力でもJSON.stringifyできる', () => {
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:['t01'], disabledRoleIds:() => true });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some(item => item.value === '[Function]'), true);
  assertJsonRoundTrips(result);
});

test('Symbolを含む不正入力でもJSON.stringifyできる', () => {
  const result = analyzePosition({ schemaVersion:Symbol('bad'), handTileIds:['t01'] });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].value, 'Symbol(bad)');
  assertJsonRoundTrips(result);
});

test('循環参照を含む不正入力でもJSON.stringifyできる', () => {
  const circular = { kind:'bad' };
  circular.self = circular;
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:['t01'], disabledRoleIds:circular });
  assert.equal(result.ok, false);
  const fieldError = result.errors.find(item => item.field === 'disabledRoleIds');
  assert.deepEqual(fieldError.value, { kind:'bad', self:'[Circular]' });
  assertJsonRoundTrips(result);
});

test('NaN / Infinityを含む不正入力でもJSON.stringifyできる', () => {
  const nanResult = analyzePosition({ schemaVersion:NaN, handTileIds:['t01'] });
  const infinityResult = analyzePosition({ schemaVersion:Infinity, handTileIds:['t01'] });
  assert.equal(nanResult.ok, false);
  assert.equal(infinityResult.ok, false);
  assert.equal(nanResult.errors[0].value, 'NaN');
  assert.equal(infinityResult.errors[0].value, 'Infinity');
  assertJsonRoundTrips(nanResult);
  assertJsonRoundTrips(infinityResult);
});

test('JSON安全化した不正入力結果をJSON.stringify / JSON.parseで往復できる', () => {
  const circular = { z:undefined, a:[1n, Symbol('x'), () => false] };
  circular.loop = circular;
  const result = analyzePosition({ schemaVersion:'1.0', handTileIds:['t01'], disabledRoleIds:circular });
  assertJsonRoundTrips(result);
});

test('同じJSON非安全な不正入力を2回解析すると同じエラー結果になる', () => {
  const circular = { z:undefined, a:[1n, Symbol('x'), () => false] };
  circular.loop = circular;
  const input = { schemaVersion:'1.0', handTileIds:['t01'], disabledRoleIds:circular };
  assert.deepEqual(analyzePosition(input), analyzePosition(input));
});
