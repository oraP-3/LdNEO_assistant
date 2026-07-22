const SCORE_STEP = 30000;

export function normalizeDisabledRoleIds(value) {
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value : []);
}

export function isRoleEnabled(role, disabledRoleIds) {
  return role.enabledByDefault !== false && !normalizeDisabledRoleIds(disabledRoleIds).has(role.id);
}

function getTileKey(tile, keyType) {
  if (keyType === 'tileId') return tile.id;
  return tile.characterId;
}

function matchesFixedSet(hand, rule) {
  const keys = new Set(hand.map(tile => getTileKey(tile, rule.keyType || 'characterId')).filter(Boolean));
  const matchCount = rule.requiredKeys.filter(key => keys.has(key)).length;
  return matchCount >= rule.requiredCount;
}

function countAttribute(hand, attribute, value) {
  return hand.filter(tile => tile[attribute] === value).length;
}

export function analyzeBasicShape(hand) {
  const seriesInfo = {};
  for (const tile of hand) {
    if (!seriesInfo[tile.series]) seriesInfo[tile.series] = { total:0, chars:0 };
    seriesInfo[tile.series].total += 1;
    if (tile.type === 'character') seriesInfo[tile.series].chars += 1;
  }

  const values = Object.values(seriesInfo);
  const isOneSeries = values.length === 1 && values[0]?.total === 9;
  const setsOfThree = values.reduce((sum, info) => (
    sum + Math.min(Math.floor(info.total / 3), info.chars)
  ), 0);

  return {
    isOneSeries,
    setsOfThree,
    isThreeSeries: !isOneSeries && setsOfThree >= 3,
    seriesInfo
  };
}

export function matchesRole(hand, role, context = {}) {
  const rule = role.rule || {};
  switch (rule.type) {
    case 'fixedSet':
      return matchesFixedSet(hand, rule);
    case 'exactHand': {
      if (hand.length !== 9 || rule.requiredTileIds.length !== 9) return false;
      const handIds = hand.map(tile => tile.id).sort();
      const requiredIds = [...rule.requiredTileIds].sort();
      return handIds.every((id, index) => id === requiredIds[index]);
    }
    case 'attributeCount':
      return countAttribute(hand, rule.attribute, rule.value) >= rule.requiredCount;
    case 'allLogoSchool':
      return hand.length === rule.requiredCount && hand.every(tile => tile.type === 'logo' || tile.type === 'school');
    case 'oneSeries':
      return analyzeBasicShape(hand).isOneSeries;
    case 'threeSeries':
      return analyzeBasicShape(hand).isThreeSeries;
    case 'thoughtPair': {
      const thoughtIds = new Set((context.thoughtTiles || []).map(tile => tile.id));
      if (thoughtIds.size !== 2) return false;
      const handIds = new Set(hand.map(tile => tile.id));
      return [...thoughtIds].every(id => handIds.has(id));
    }
    default:
      return false;
  }
}

function scoreForRole(role, context) {
  if (role.rule?.type === 'thoughtPair') return context.isOya ? 120000 : 90000;
  return role.score;
}

function matchedBonusRoles(hand, roles, disabledRoleIds, context) {
  const enabled = roles.filter(role => role.category === 'bonus' && isRoleEnabled(role, disabledRoleIds));
  const byId = new Map(enabled.map(role => [role.id, role]));
  const matched = [];

  for (const role of enabled) {
    if (!matchesRole(hand, role, context)) continue;
    const superiorId = role.rule?.supersededBy;
    if (superiorId) {
      const superior = byId.get(superiorId);
      if (superior && matchesRole(hand, superior, context)) continue;
    }
    matched.push({ id:role.id, name:role.name, score:scoreForRole(role, context), category:role.category, group:role.group });
  }
  return matched;
}

export function evaluateHand(hand, context = {}) {
  if (!Array.isArray(hand) || hand.length !== 9) return { canAgari:false, reason:'length', matchedRoles:[], yaku:[], totalScore:0 };

  const roles = context.roles || [];
  const disabledRoleIds = normalizeDisabledRoleIds(context.disabledRoleIds);

  const standalone = roles
    .filter(role => role.category === 'standalone' && isRoleEnabled(role, disabledRoleIds))
    .filter(role => matchesRole(hand, role, context))
    .map(role => ({ id:role.id, name:role.name, score:scoreForRole(role, context), category:role.category, group:role.group }));

  let base = [];
  if (standalone.length === 0) {
    const oneSeriesRole = roles.find(role => role.id === 'base.one_series');
    const threeSeriesRole = roles.find(role => role.id === 'base.three_series');
    const shape = analyzeBasicShape(hand);

    if (shape.isOneSeries && oneSeriesRole && isRoleEnabled(oneSeriesRole, disabledRoleIds)) {
      base = [{ id:oneSeriesRole.id, name:oneSeriesRole.name, score:oneSeriesRole.score, category:'base', group:oneSeriesRole.group }];
    } else if (shape.isThreeSeries && threeSeriesRole && isRoleEnabled(threeSeriesRole, disabledRoleIds)) {
      base = [{ id:threeSeriesRole.id, name:threeSeriesRole.name, score:threeSeriesRole.score, category:'base', group:threeSeriesRole.group }];
    }
  }

  const bonus = matchedBonusRoles(hand, roles, disabledRoleIds, context);
  const canAgari = standalone.length > 0 || (base.length > 0 && bonus.length > 0);
  const matchedRoles = [...standalone, ...base, ...bonus];
  const totalScore = canAgari ? matchedRoles.reduce((sum, role) => sum + role.score, 0) : 0;

  let reason = null;
  if (!canAgari) {
    if (standalone.length === 0 && base.length === 0) reason = 'basic';
    else reason = 'bonus';
  }

  return { canAgari, reason, matchedRoles, yaku:matchedRoles, totalScore };
}

export function checkMachi(base8Tiles, context = {}, excludeTileIds = []) {
  const allTiles = context.tiles || [];
  const visibleTiles = context.visibleTiles || [];
  const visibleIds = new Set(visibleTiles.map(tile => tile.id));
  const excluded = new Set(excludeTileIds);
  const handIds = new Set(base8Tiles.map(tile => tile.id));
  const groups = new Map();
  let count = 0;
  let availableCount = 0;

  for (const candidateTile of allTiles) {
    if (handIds.has(candidateTile.id) || excluded.has(candidateTile.id)) continue;
    const result = evaluateHand([...base8Tiles, candidateTile], context);
    if (!result.canAgari) continue;

    count += 1;
    const isJunkara = visibleIds.has(candidateTile.id);
    if (!isJunkara) availableCount += 1;
    const roleKey = result.matchedRoles.map(role => role.id).join('|');
    const key = `${result.totalScore}_${roleKey}`;
    if (!groups.has(key)) {
      groups.set(key, {
        score:result.totalScore,
        roleIds:result.matchedRoles.map(role => role.id),
        yakuText:result.matchedRoles.map(role => role.name).join(', '),
        tiles:[]
      });
    }
    groups.get(key).tiles.push({ tile:candidateTile, isJunkara });
  }

  const resultGroups = [...groups.values()].sort((a,b) => b.score - a.score);
  return { count, availableCount, groups:resultGroups };
}

function enumerateSeriesOptions(seriesTiles, candidateIds, fixedAll, treatAllAsCharacters) {
  const candidateChars = seriesTiles.filter(tile => candidateIds.has(tile.id) && tile.type === 'character').length;
  const candidateOthers = seriesTiles.filter(tile => candidateIds.has(tile.id) && tile.type !== 'character').length;
  const otherChars = seriesTiles.filter(tile => !candidateIds.has(tile.id) && tile.type === 'character').length;
  const otherOthers = seriesTiles.filter(tile => !candidateIds.has(tile.id) && tile.type !== 'character').length;
  const options = new Map();

  const addOption = (a,b,c,d) => {
    const tileCount = a+b+c+d;
    if (tileCount > 9) return;
    const actualChars = a+c;
    const charCount = treatAllAsCharacters ? tileCount : actualChars;
    const matches = a+b;
    const sets = Math.min(Math.floor(tileCount/3), charCount);
    const key = `${tileCount}|${charCount}|${matches}|${sets}`;
    options.set(key,{ tileCount, charCount, matches, sets, nonempty:tileCount>0?1:0 });
  };

  if (fixedAll) {
    for (let c=0;c<=otherChars;c+=1) {
      for (let d=0;d<=otherOthers;d+=1) addOption(candidateChars,candidateOthers,c,d);
    }
  } else {
    for (let a=0;a<=candidateChars;a+=1) {
      for (let b=0;b<=candidateOthers;b+=1) {
        for (let c=0;c<=otherChars;c+=1) {
          for (let d=0;d<=otherOthers;d+=1) addOption(a,b,c,d);
        }
      }
    }
  }
  return [...options.values()];
}

export function isBonusRoleCompletionPossible(role, allTiles, options = {}) {
  const ids = role.rule?.requiredKeys || [];
  const requiredCount = role.rule?.requiredCount ?? ids.length;
  const fixedAll = requiredCount === ids.length;
  const candidateIds = new Set(ids);
  const treatAllAsCharacters = options.treatAllAsCharacters === true;

  if (requiredCount < 1 || requiredCount > 9) return false;
  if (fixedAll && ids.length > 9) return false;

  const series = [...new Set(allTiles.map(tile => tile.series))];
  let states = new Map([['0|0|0|0',{ used:0, matches:0, sets:0, nonempty:0 }]]);

  for (const seriesKey of series) {
    const seriesTiles = allTiles.filter(tile => tile.series === seriesKey);
    const seriesOptions = enumerateSeriesOptions(seriesTiles,candidateIds,fixedAll,treatAllAsCharacters);
    const next = new Map();
    for (const state of states.values()) {
      for (const option of seriesOptions) {
        const used = state.used + option.tileCount;
        if (used > 9) continue;
        const matches = Math.min(requiredCount, state.matches + option.matches);
        const sets = Math.min(3, state.sets + option.sets);
        const nonempty = Math.min(2, state.nonempty + option.nonempty);
        const key = `${used}|${matches}|${sets}|${nonempty}`;
        next.set(key,{ used,matches,sets,nonempty });
      }
    }
    states = next;
  }

  for (const state of states.values()) {
    if (state.used !== 9 || state.matches < requiredCount) continue;
    const oneSeries = state.nonempty === 1;
    const threeSeries = state.nonempty >= 2 && state.sets >= 3;
    if (oneSeries || threeSeries) return true;
  }
  return false;
}

function seriesBreakdown(ids, allTiles) {
  const tileMap = new Map(allTiles.map(tile => [tile.id,tile]));
  const counts = {};
  for (const id of ids) {
    const tile = tileMap.get(id);
    if (!tile) continue;
    counts[tile.series] = (counts[tile.series] || 0) + 1;
  }
  return Object.values(counts).sort((a,b)=>b-a);
}

export function validateCustomRole(role, allTiles, existingRoles = []) {
  const name = String(role?.name || '').trim();
  const score = Number(role?.score);
  if (!name) return { valid:false, code:'name', message:'役名を入力してください。' };
  if (!Number.isInteger(score) || score < SCORE_STEP || score % SCORE_STEP !== 0) {
    return { valid:false, code:'score', message:'点数は30,000ジャラ以上、30,000ジャラ単位で設定してください。' };
  }

  const tileIds = new Set(allTiles.map(tile => tile.id));
  if (role.category === 'standalone') {
    const ids = role.rule?.requiredTileIds || [];
    if (ids.length !== 9) return { valid:false, code:'special_count', message:`特殊役には、アガリ手となる9枚すべてを指定してください。現在は${ids.length}枚です。` };
    if (new Set(ids).size !== ids.length) return { valid:false, code:'duplicate_tile', message:'同じ牌を複数回指定することはできません。' };
    if (ids.some(id => !tileIds.has(id))) return { valid:false, code:'unknown_tile', message:'存在しない牌が指定されています。' };
    const sorted = [...ids].sort().join('|');
    const duplicate = existingRoles.some(existing => existing.id !== role.id && existing.category === 'standalone' && existing.rule?.type === 'exactHand' && [...existing.rule.requiredTileIds].sort().join('|') === sorted);
    if (duplicate) return { valid:false, code:'duplicate_special', message:'同じ9枚を成立条件とする特殊役がすでに登録されています。' };
    return { valid:true };
  }

  if (role.category !== 'bonus') return { valid:false, code:'category', message:'追加できる役は加点役または特殊役です。' };
  const ids = role.rule?.requiredKeys || [];
  const requiredCount = Number(role.rule?.requiredCount);
  if (ids.length < 1) return { valid:false, code:'tiles', message:'対象となる牌を1枚以上選択してください。' };
  if (new Set(ids).size !== ids.length) return { valid:false, code:'duplicate_tile', message:'同じ牌を複数回指定することはできません。' };
  if (ids.some(id => !tileIds.has(id))) return { valid:false, code:'unknown_tile', message:'存在しない牌が指定されています。' };
  if (!Number.isInteger(requiredCount) || requiredCount < 1 || requiredCount > ids.length) return { valid:false, code:'required_count', message:'成立に必要な枚数を正しく設定してください。' };
  if (requiredCount > 9 || (requiredCount === ids.length && ids.length > 9)) return { valid:false, code:'too_many', message:'成立に必要な牌が9枚を超えています。' };

  const normalized = {
    ...role,
    rule:{ type:'fixedSet', keyType:'tileId', requiredKeys:ids, requiredCount }
  };
  if (isBonusRoleCompletionPossible(normalized,allTiles)) return { valid:true };

  const countsBySeries = seriesBreakdown(ids,allTiles);
  const distinctSeries = countsBySeries.length;
  const topThreeCandidateCount = countsBySeries.slice(0,3).reduce((sum,value)=>sum+value,0);
  const fixedAll = requiredCount === ids.length;
  if ((fixedAll && distinctSeries >= 4) || (!fixedAll && topThreeCandidateCount < requiredCount)) {
    return { valid:false, code:'four_series', message:'この役を成立させるには4シリーズ以上の牌が必須となるため、現在の基本役を同時に成立させることができません。' };
  }

  const relaxed = isBonusRoleCompletionPossible(normalized,allTiles,{treatAllAsCharacters:true});
  if (relaxed) {
    return { valid:false, code:'character_shortage', message:'ロゴ牌・校章牌の割合が多く、基本役の3枚組に必要なキャラクター牌を確保できません。' };
  }

  if (fixedAll && countsBySeries.length > 0) {
    return { valid:false, code:'series_distribution', message:`必須牌のシリーズ内訳が${countsBySeries.join('枚・')}枚となるため、基本役となる3枚組を3組作れません。` };
  }
  return { valid:false, code:'impossible', message:'この条件を満たしながら、現在の基本役でアガれる9枚の組合せを作ることができません。' };
}

export { SCORE_STEP };
