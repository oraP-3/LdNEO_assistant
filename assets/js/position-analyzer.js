import { analyzeBasicShape, checkMachi, evaluateHand } from './role-engine.js';

function summarizeSeries(hand) {
  const { seriesInfo } = analyzeBasicShape(hand);
  return Object.fromEntries(
    Object.entries(seriesInfo)
      .map(([series, info]) => [series, { total:info.total, characters:info.chars }])
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function uniqueByTileId(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.tile.id)) return false;
    seen.add(item.tile.id);
    return true;
  });
}

export function analyzeDiscardCandidates(hand9Tiles, context = {}) {
  if (!Array.isArray(hand9Tiles) || hand9Tiles.length !== 9) {
    return { candidates:[], reason:'length' };
  }
  if (new Set(hand9Tiles.map(tile => tile.id)).size !== hand9Tiles.length) {
    return { candidates:[], reason:'duplicate_tile' };
  }

  const candidates = [];
  const testedDiscards = new Set();

  hand9Tiles.forEach((discardTile, discardIndex) => {
    if (testedDiscards.has(discardTile.id)) return;
    testedDiscards.add(discardTile.id);

    const handAfterDiscard = [...hand9Tiles];
    handAfterDiscard.splice(discardIndex, 1);
    const machi = checkMachi(handAfterDiscard, context, [discardTile.id]);
    const winningTiles = uniqueByTileId(
      machi.groups.flatMap(group => group.tiles)
    ).map(({ tile, isJunkara }) => {
      const finalHand = [...handAfterDiscard, tile];
      const result = evaluateHand(finalHand, context);
      return {
        tile,
        finalHand,
        matchedRoles:result.matchedRoles,
        yaku:result.yaku,
        totalScore:result.totalScore,
        isJunkara
      };
    });

    candidates.push({
      discardTile,
      seriesComposition:summarizeSeries(handAfterDiscard),
      winningTiles,
      availableWinningTileCount:winningTiles.filter(item => !item.isJunkara).length,
      isJunkara:winningTiles.length > 0 && winningTiles.every(item => item.isJunkara)
    });
  });

  return { candidates, reason:null };
}
