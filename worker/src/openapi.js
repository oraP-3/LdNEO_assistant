const PRODUCTION_URL = 'https://ldneo-analysis-api.ldneo-tools.workers.dev';

const errorResponses = {
  400:{ description:'Invalid request', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ErrorResponse' } } } },
  401:{ description:'Unauthorized', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ErrorResponse' } } } },
  413:{ description:'Payload too large', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ErrorResponse' } } } },
  415:{ description:'Unsupported media type', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ErrorResponse' } } } },
  500:{ description:'Internal analysis error', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ErrorResponse' } } } },
  503:{ description:'Service unavailable', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ErrorResponse' } } } }
};

const schemaVersion = { const:'1.0' };
const stringIdArray = { type:'array', uniqueItems:true, items:{ type:'string' } };
const roleResult = {
  type:'object',
  required:['id','name','score','category','group'],
  properties:{ id:{ type:'string' }, name:{ type:'string' }, score:{ type:'integer' }, category:{ type:'string' }, group:{ type:'string' } },
  additionalProperties:true
};
const analysisTile = {
  type:'object',
  required:['id','name','series','type','grade','birthMonth','hasSpecial'],
  properties:{ id:{ type:'string' }, name:{ type:'string' }, series:{ type:'string' }, type:{ type:'string' }, grade:{ type:['integer','null'] }, birthMonth:{ type:['integer','null'] }, hasSpecial:{ type:'boolean' } },
  additionalProperties:false
};
const normalizedInput = {
  type:'object',
  required:['schemaVersion','handTileIds','visibleTileIds','thoughtTileIds','disabledRoleIds','customRoles','isOya'],
  properties:{ schemaVersion, handTileIds:stringIdArray, visibleTileIds:stringIdArray, thoughtTileIds:stringIdArray, disabledRoleIds:stringIdArray, customRoles:{ type:'array', items:{ type:'object', additionalProperties:true } }, isOya:{ type:'boolean' } },
  additionalProperties:false
};

export function openApiDocument() {
  return {
    openapi:'3.1.0',
    info:{
      title:'LdNEO Analysis API',
      version:'1.0.0',
      description:'このAPIはゲーム局面の解析専用です。個人情報を送信しないでください。APIキーをリクエスト本文へ含めず、Authorization Bearerヘッダーだけで送信してください。解析結果と戦略的助言を区別し、APIが返していない多手先評価をAPI結果であるかのように述べないでください。'
    },
    servers:[{ url:PRODUCTION_URL }],
    paths:{
      '/resolve-tiles':{
        post:{
          operationId:'resolveTiles',
          description:'ユーザーが牌名を指定した場合、IDを推測せず必ずこの操作を使います。複数の牌名を1回でまとめて送ります。候補が複数ある場合は、ユーザーへ確認してから解析します。',
          security:[{ bearerAuth:[] }],
          requestBody:{ required:true, content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ResolveTilesRequest' } } } },
          responses:{ 200:{ description:'Resolved tile candidates', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ResolveTilesResponse' } } } }, ...errorResponses }
        }
      },
      '/roles':{
        get:{
          operationId:'listRoles',
          description:'disabledRoleIdsを指定する必要がある場合に使います。通常の全役有効設定では呼び出し必須ではありません。',
          security:[{ bearerAuth:[] }],
          responses:{ 200:{ description:'Built-in roles', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/RolesResponse' } } } }, ...errorResponses }
        }
      },
      '/analyze-position':{
        post:{
          operationId:'analyzePosition',
          description:'handTileIdsが8枚なら直接のアガリ待ちを返します。handTileIdsが9枚なら現在のアガリ判定と全切り牌候補を返します。9牌時のwinningTilesは、1枚切った直後の直接のアガリ待ちだけを表します。待ち0枚候補も返ります。長期的な牌効率や多手先の改善度はまだ評価しません。属性役は必ず最終的な合法9牌だけで評価されます。visibleTileIdsは純カラ判定へ使用されます。入力した牌名をIDへ変換する際はresolveTilesを先に使います。',
          security:[{ bearerAuth:[] }],
          requestBody:{ required:true, content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/AnalysisRequest' } } } },
          responses:{ 200:{ description:'Analysis result', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/AnalysisResponse' } } } }, ...errorResponses }
        }
      }
    },
    components:{
      securitySchemes:{ bearerAuth:{ type:'http', scheme:'bearer' } },
      schemas:{
        ErrorItem:{ type:'object', required:['code','field','value','message'], properties:{ code:{ type:'string' }, field:{ type:['string','null'] }, value:{}, message:{ type:'string' } }, additionalProperties:false },
        ErrorResponse:{ type:'object', required:['schemaVersion','ok','errors'], properties:{ schemaVersion, ok:{ const:false }, errors:{ type:'array', items:{ $ref:'#/components/schemas/ErrorItem' } } }, additionalProperties:true },
        CatalogTile:{ type:'object', required:['id','name','series','type','characterId','grade','unit','birthMonth','hasSpecial'], properties:{ id:{ type:'string' }, name:{ type:'string' }, series:{ type:'string' }, type:{ type:'string' }, characterId:{ type:['string','null'] }, grade:{ type:['integer','null'] }, unit:{ type:['string','null'] }, birthMonth:{ type:['integer','null'] }, hasSpecial:{ type:'boolean' } }, additionalProperties:false },
        Tile:{ $ref:'#/components/schemas/CatalogTile' },
        TileMatch:{ type:'object', required:['id','name','series','type','characterId','grade','unit','birthMonth','hasSpecial','matchType'], properties:{ id:{ type:'string' }, name:{ type:'string' }, series:{ type:'string' }, type:{ type:'string' }, characterId:{ type:['string','null'] }, grade:{ type:['integer','null'] }, unit:{ type:['string','null'] }, birthMonth:{ type:['integer','null'] }, hasSpecial:{ type:'boolean' }, matchType:{ enum:['exactId','exactName','exactCharacterId','prefixName','partialName','partialMetadata'] } }, additionalProperties:false },
        ResolveTilesRequest:{ type:'object', required:['schemaVersion','queries'], properties:{ schemaVersion, queries:{ type:'array', minItems:1, maxItems:20, items:{ type:'string', minLength:1, maxLength:100 } } }, additionalProperties:false },
        ResolveTilesResponse:{ type:'object', required:['schemaVersion','ok','results','errors'], properties:{ schemaVersion, ok:{ type:'boolean' }, results:{ type:'array', items:{ type:'object', required:['query','normalizedQuery','matches'], properties:{ query:{ type:'string' }, normalizedQuery:{ type:'string' }, matches:{ type:'array', maxItems:10, items:{ $ref:'#/components/schemas/TileMatch' } } }, additionalProperties:false } }, errors:{ type:'array', items:{ $ref:'#/components/schemas/ErrorItem' } } }, additionalProperties:false },
        RoleSummary:{ type:'object', required:['id','name','score','category','group','enabledByDefault','ruleType'], properties:{ id:{ type:'string' }, name:{ type:'string' }, score:{ type:'integer' }, category:{ type:'string' }, group:{ type:'string' }, enabledByDefault:{ type:'boolean' }, ruleType:{ type:['string','null'] } }, additionalProperties:false },
        RolesResponse:{ type:'object', required:['schemaVersion','ok','roles','errors'], properties:{ schemaVersion, ok:{ const:true }, roles:{ type:'array', items:{ $ref:'#/components/schemas/RoleSummary' } }, errors:{ type:'array', items:{ $ref:'#/components/schemas/ErrorItem' } } }, additionalProperties:false },
        AnalysisRequest:{ type:'object', required:['schemaVersion','handTileIds'], properties:{ schemaVersion, handTileIds:{ type:'array', minItems:8, maxItems:9, uniqueItems:true, description:'8または9枚のみ有効です。', items:{ type:'string' } }, visibleTileIds:stringIdArray, thoughtTileIds:stringIdArray, disabledRoleIds:stringIdArray, customRoles:{ type:'array', items:{ type:'object', additionalProperties:true } }, isOya:{ type:'boolean' } }, additionalProperties:false },
        AnalysisTile:analysisTile,
        AnalysisRole:roleResult,
        AnalysisInput:normalizedInput,
        WaitWinningTile:{ type:'object', required:['tile','isJunkara'], properties:{ tile:{ $ref:'#/components/schemas/AnalysisTile' }, isJunkara:{ type:'boolean' } }, additionalProperties:false },
        WaitGroup:{ type:'object', required:['totalScore','matchedRoles','winningTiles'], properties:{ totalScore:{ type:'integer' }, matchedRoles:{ type:'array', items:{ $ref:'#/components/schemas/AnalysisRole' } }, winningTiles:{ type:'array', items:{ $ref:'#/components/schemas/WaitWinningTile' } } }, additionalProperties:false },
        Waits:{ type:'object', required:['availableCount','totalCount','groups'], properties:{ availableCount:{ type:'integer' }, totalCount:{ type:'integer' }, groups:{ type:'array', items:{ $ref:'#/components/schemas/WaitGroup' } } }, additionalProperties:false },
        CurrentHand:{ type:'object', required:['canAgari','reason','totalScore','matchedRoles'], properties:{ canAgari:{ type:'boolean' }, reason:{ type:['string','null'] }, totalScore:{ type:'integer' }, matchedRoles:{ type:'array', items:{ $ref:'#/components/schemas/AnalysisRole' } } }, additionalProperties:false },
        DiscardWinningTile:{ type:'object', required:['tile','finalHandTileIds','totalScore','matchedRoles','isJunkara'], properties:{ tile:{ $ref:'#/components/schemas/AnalysisTile' }, finalHandTileIds:stringIdArray, totalScore:{ type:'integer' }, matchedRoles:{ type:'array', items:{ $ref:'#/components/schemas/AnalysisRole' } }, isJunkara:{ type:'boolean' } }, additionalProperties:false },
        SeriesCompositionEntry:{ type:'object', required:['total','characters'], properties:{ total:{ type:'integer', minimum:0 }, characters:{ type:'integer', minimum:0 } }, additionalProperties:false },
        SeriesComposition:{ type:'object', additionalProperties:{ $ref:'#/components/schemas/SeriesCompositionEntry' } },
        DiscardCandidate:{ type:'object', required:['discardTile','handAfterDiscardTileIds','seriesComposition','availableWinningTileCount','isJunkara','winningTiles'], properties:{ discardTile:{ $ref:'#/components/schemas/AnalysisTile' }, handAfterDiscardTileIds:stringIdArray, seriesComposition:{ $ref:'#/components/schemas/SeriesComposition' }, availableWinningTileCount:{ type:'integer' }, isJunkara:{ type:'boolean' }, winningTiles:{ type:'array', items:{ $ref:'#/components/schemas/DiscardWinningTile' } } }, additionalProperties:false },
        AnalysisWaitsResponse:{ type:'object', required:['schemaVersion','ok','input','waits','errors'], properties:{ schemaVersion, ok:{ const:true }, input:{ $ref:'#/components/schemas/AnalysisInput' }, waits:{ $ref:'#/components/schemas/Waits' }, errors:{ type:'array', items:{ $ref:'#/components/schemas/ErrorItem' } } }, additionalProperties:false },
        AnalysisDiscardResponse:{ type:'object', required:['schemaVersion','ok','input','currentHand','discardCandidates','errors'], properties:{ schemaVersion, ok:{ const:true }, input:{ $ref:'#/components/schemas/AnalysisInput' }, currentHand:{ $ref:'#/components/schemas/CurrentHand' }, discardCandidates:{ type:'array', items:{ $ref:'#/components/schemas/DiscardCandidate' } }, errors:{ type:'array', items:{ $ref:'#/components/schemas/ErrorItem' } } }, additionalProperties:false },
        AnalysisResponse:{ oneOf:[{ $ref:'#/components/schemas/AnalysisWaitsResponse' }, { $ref:'#/components/schemas/AnalysisDiscardResponse' }] }
      }
    }
  };
}

export { PRODUCTION_URL };
