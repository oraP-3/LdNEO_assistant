import test from 'node:test';
import assert from 'node:assert/strict';
import { tiles, defaultRoles } from '../assets/js/data.js';
import { evaluateHand, checkMachi, validateCustomRole } from '../assets/js/role-engine.js';

const byId = id => tiles.find(tile => tile.id === id);
const hand = ids => ids.map(byId);
const context = (extra={}) => ({roles:defaultRoles,disabledRoleIds:new Set(),isOya:true,thoughtTiles:[],tiles,visibleTiles:[],...extra});

function customBonus({id='custom_bonus',name='テスト加点役',score=90000,ids,requiredCount=ids.length}) {
  return {id,name,score,category:'bonus',group:'custom',builtIn:false,enabledByDefault:true,rule:{type:'fixedSet',keyType:'tileId',requiredKeys:ids,requiredCount}};
}
function customSpecial({id='custom_special',name='テスト特殊役',score=900000,ids}) {
  return {id,name,score,category:'standalone',group:'custom',builtIn:false,enabledByDefault:true,rule:{type:'exactHand',requiredTileIds:ids}};
}

test('既存役名に「セット」を自動付与しない',()=>{
  assert.equal(defaultRoles.some(role=>role.name.endsWith('セット')),false);
  assert.ok(defaultRoles.some(role=>role.name==='1シリーズ'));
  assert.ok(defaultRoles.some(role=>role.name==='3シリーズ'));
  assert.ok(defaultRoles.some(role=>role.name==='親の思想'));
});

test('指定された3つのチームをユニット役として収録する',()=>{
  const expected=[['チームこども',150000],['チームスポーツ',150000],['チームみどり',120000]];
  for(const [name,score] of expected){
    const role=defaultRoles.find(item=>item.name===name);
    assert.ok(role);
    assert.equal(role.group,'unit');
    assert.equal(role.category,'bonus');
    assert.equal(role.score,score);
  }
});

test('チームこどもがLiella!のアガリ手で加点される',()=>{
  const result=evaluateHand(hand(['t38','t39','t43','t46','t40','t41','t42','t44','t45']),context());
  assert.equal(result.canAgari,true);
  assert.ok(result.matchedRoles.some(role=>role.name==='1シリーズ'));
  assert.ok(result.matchedRoles.some(role=>role.name==='チームこども'));
});


test('チームスポーツがLiella!のアガリ手で加点される',()=>{
  const result=evaluateHand(hand(['t40','t41','t44','t47','t38','t39','t42','t43','t45']),context());
  assert.equal(result.canAgari,true);
  assert.ok(result.matchedRoles.some(role=>role.name==='チームスポーツ'));
});

test('チームみどりがLiella!のアガリ手で加点される',()=>{
  const result=evaluateHand(hand(['t42','t45','t48','t38','t39','t40','t41','t43','t44']),context());
  assert.equal(result.canAgari,true);
  assert.ok(result.matchedRoles.some(role=>role.name==='チームみどり'));
});

test('役をOFFにすると成立役と点数から除外される',()=>{
  const ids=['t38','t39','t43','t46','t40','t41','t42','t44','t45'];
  const enabled=evaluateHand(hand(ids),context());
  const disabled=evaluateHand(hand(ids),context({disabledRoleIds:new Set(['bonus.unit.team_kodomo'])}));
  assert.equal(disabled.matchedRoles.some(role=>role.name==='チームこども'),false);
  assert.equal(enabled.totalScore-disabled.totalScore,150000);
});

test('ALL STARSは基本役なしでもアガリになる',()=>{
  const result=evaluateHand(hand(['t10','t11','t21','t22','t36','t37','t49','t50','t59']),context());
  assert.equal(result.canAgari,true);
  assert.ok(result.matchedRoles.some(role=>role.name==='ALL STARS'));
  assert.equal(result.matchedRoles.some(role=>role.category==='base'),false);
});

test('緑一色は候補10牌のうち9牌で成立する',()=>{
  const result=evaluateHand(hand(['t08','t14','t31','t33','t41','t58','t64','t69','t75']),context());
  assert.equal(result.canAgari,true);
  assert.ok(result.matchedRoles.some(role=>role.name==='緑一色'));
});

test('カスタム特殊役は指定9枚の完全一致で単独アガリになる',()=>{
  const ids=['t01','t12','t24','t38','t51','t61','t73','t10','t21'];
  const role=customSpecial({ids});
  const validation=validateCustomRole(role,tiles,defaultRoles);
  assert.equal(validation.valid,true);
  const result=evaluateHand(hand(ids),context({roles:[...defaultRoles,role]}));
  assert.equal(result.canAgari,true);
  assert.ok(result.matchedRoles.some(item=>item.id===role.id));
});

test('カスタム特殊役は8枚一致と指定外1枚では成立しない',()=>{
  const ids=['t01','t12','t24','t38','t51','t61','t73','t10','t21'];
  const role=customSpecial({ids});
  const result=evaluateHand(hand([...ids.slice(0,8),'t22']),context({roles:[...defaultRoles,role]}));
  assert.equal(result.matchedRoles.some(item=>item.id===role.id),false);
});

test('カスタム特殊役の8枚から残り1枚を待ち牌として検出する',()=>{
  const ids=['t01','t12','t24','t38','t51','t61','t73','t10','t21'];
  const role=customSpecial({ids});
  const result=checkMachi(hand(ids.slice(0,8)),context({roles:[...defaultRoles,role]}));
  assert.ok(result.groups.some(group=>group.tiles.some(item=>item.tile.id==='t21')));
});

test('点数は30,000ジャラ単位のみ保存可能',()=>{
  const valid=customBonus({score:120000,ids:['t01','t02','t03']});
  const invalid=customBonus({score:100000,ids:['t01','t02','t03']});
  assert.equal(validateCustomRole(valid,tiles,defaultRoles).valid,true);
  const result=validateCustomRole(invalid,tiles,defaultRoles);
  assert.equal(result.valid,false);
  assert.equal(result.code,'score');
});

test('4シリーズ以上が必須となる加点役は保存できない',()=>{
  const role=customBonus({ids:['t01','t12','t24','t38']});
  const result=validateCustomRole(role,tiles,defaultRoles);
  assert.equal(result.valid,false);
  assert.equal(result.code,'four_series');
});

test('3シリーズでも4・4・1固定では基本役を作れず保存できない',()=>{
  const role=customBonus({ids:['t01','t02','t03','t04','t12','t13','t14','t15','t24']});
  const result=validateCustomRole(role,tiles,defaultRoles);
  assert.equal(result.valid,false);
  assert.equal(result.code,'series_distribution');
  assert.match(result.message,/4枚・4枚・1枚/);
});

test('3シリーズに3枚ずつ固定された加点役は保存可能',()=>{
  const role=customBonus({ids:['t01','t02','t03','t12','t13','t14','t24','t25','t26']});
  assert.equal(validateCustomRole(role,tiles,defaultRoles).valid,true);
});

test('候補が4シリーズでも3枚以上条件が3シリーズ以内で成立すれば保存可能',()=>{
  const role=customBonus({ids:['t01','t12','t24','t38'],requiredCount:3});
  assert.equal(validateCustomRole(role,tiles,defaultRoles).valid,true);
});

test('同じ9枚のカスタム特殊役は重複登録できない',()=>{
  const ids=['t01','t12','t24','t38','t51','t61','t73','t10','t21'];
  const existing=customSpecial({id:'custom_a',ids});
  const duplicate=customSpecial({id:'custom_b',ids});
  const result=validateCustomRole(duplicate,tiles,[...defaultRoles,existing]);
  assert.equal(result.valid,false);
  assert.equal(result.code,'duplicate_special');
});
