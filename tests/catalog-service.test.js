import test from 'node:test';
import assert from 'node:assert/strict';
import { listRoles, resolveTiles } from '../worker/src/catalog-service.js';

function first(query) {
  return resolveTiles({ schemaVersion:'1.0', queries:[query] }).results[0].matches[0];
}

test('「上原歩夢」でt24が完全一致', () => {
  assert.equal(first('上原歩夢').id, 't24');
  assert.equal(first('上原歩夢').matchType, 'exactName');
});

test('「上原 歩夢」でt24が完全一致', () => {
  assert.equal(first('上原 歩夢').id, 't24');
  assert.equal(first('上原 歩夢').matchType, 'exactName');
});

test('「エマヴェルデ」で「エマ・ヴェルデ」が一致', () => {
  const match = first('エマヴェルデ');
  assert.equal(match.id, 't31');
  assert.equal(match.name, 'エマ・ヴェルデ');
});

test('tile ID完全一致', () => {
  assert.equal(first('t38').matchType, 'exactId');
  assert.equal(first('t38').id, 't38');
});

test('characterId完全一致', () => {
  assert.equal(first('niji_ayumu').id, 't24');
  assert.equal(first('niji_ayumu').matchType, 'exactCharacterId');
});

test('部分一致', () => {
  const result = resolveTiles({ schemaVersion:'1.0', queries:['ロゴ'] });
  assert.ok(result.results[0].matches.length > 1);
  assert.equal(result.results[0].matches[0].matchType, 'partialName');
});

test('一致なしでmatchesが空', () => {
  assert.deepEqual(resolveTiles({ schemaVersion:'1.0', queries:['not-a-tile'] }).results[0].matches, []);
});

test('複数queryの入力順を維持', () => {
  const result = resolveTiles({ schemaVersion:'1.0', queries:['t38', '上原歩夢', 'not-a-tile'] });
  assert.deepEqual(result.results.map(item => item.query), ['t38', '上原歩夢', 'not-a-tile']);
});

test('同じ入力から同じ結果になる', () => {
  const input = { schemaVersion:'1.0', queries:['ニジ', 't38', '上原歩夢'] };
  assert.deepEqual(resolveTiles(input), resolveTiles(input));
});

test('最大10件', () => {
  const result = resolveTiles({ schemaVersion:'1.0', queries:['t'] });
  assert.equal(result.results[0].matches.length, 10);
});

test('tileのnull値がnullとして残る', () => {
  const match = first('t10');
  assert.equal(match.characterId, null);
  assert.equal(match.grade, null);
  assert.equal(match.unit, null);
  assert.equal(match.birthMonth, null);
});

test('rolesはid昇順でundefinedを含まない', () => {
  const body = listRoles();
  assert.deepEqual(body.roles.map(role => role.id), [...body.roles.map(role => role.id)].sort());
  assert.equal(JSON.stringify(body).includes('undefined'), false);
});
