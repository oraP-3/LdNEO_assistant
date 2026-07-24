const PRODUCTION_URL = 'https://ldneo-analysis-api.ldneo-tools.workers.dev';

const errorResponses = {
  400:{ description:'Invalid request', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ErrorResponse' } } } },
  401:{ description:'Unauthorized', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ErrorResponse' } } } },
  413:{ description:'Payload too large', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ErrorResponse' } } } },
  415:{ description:'Unsupported media type', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ErrorResponse' } } } },
  500:{ description:'Internal analysis error', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ErrorResponse' } } } },
  503:{ description:'Service unavailable', content:{ 'application/json':{ schema:{ $ref:'#/components/schemas/ErrorResponse' } } } }
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
        ErrorResponse:{ type:'object', required:['schemaVersion','ok','errors'], properties:{ schemaVersion:{ type:'string' }, ok:{ const:false }, errors:{ type:'array', items:{ $ref:'#/components/schemas/ErrorItem' } } }, additionalProperties:true },
        Tile:{ type:'object', required:['id','name','series','type','characterId','grade','unit','birthMonth','hasSpecial'], properties:{ id:{ type:'string' }, name:{ type:'string' }, series:{ type:'string' }, type:{ type:'string' }, characterId:{ type:['string','null'] }, grade:{ type:['integer','null'] }, unit:{ type:['string','null'] }, birthMonth:{ type:['integer','null'] }, hasSpecial:{ type:'boolean' } }, additionalProperties:false },
        TileMatch:{ allOf:[{ $ref:'#/components/schemas/Tile' }, { type:'object', required:['matchType'], properties:{ matchType:{ enum:['exactId','exactName','exactCharacterId','prefixName','partialName','partialMetadata'] } } }] },
        ResolveTilesRequest:{ type:'object', required:['schemaVersion','queries'], properties:{ schemaVersion:{ type:'string' }, queries:{ type:'array', minItems:1, maxItems:20, items:{ type:'string', minLength:1, maxLength:100 } } }, additionalProperties:false },
        ResolveTilesResponse:{ type:'object', required:['schemaVersion','ok','results','errors'], properties:{ schemaVersion:{ type:'string' }, ok:{ type:'boolean' }, results:{ type:'array', items:{ type:'object', required:['query','normalizedQuery','matches'], properties:{ query:{ type:'string' }, normalizedQuery:{ type:'string' }, matches:{ type:'array', maxItems:10, items:{ $ref:'#/components/schemas/TileMatch' } } }, additionalProperties:false } }, errors:{ type:'array', items:{ $ref:'#/components/schemas/ErrorItem' } } }, additionalProperties:false },
        RoleSummary:{ type:'object', required:['id','name','score','category','group','enabledByDefault','ruleType'], properties:{ id:{ type:'string' }, name:{ type:'string' }, score:{ type:'integer' }, category:{ type:'string' }, group:{ type:'string' }, enabledByDefault:{ type:'boolean' }, ruleType:{ type:['string','null'] } }, additionalProperties:false },
        RolesResponse:{ type:'object', required:['schemaVersion','ok','roles','errors'], properties:{ schemaVersion:{ type:'string' }, ok:{ const:true }, roles:{ type:'array', items:{ $ref:'#/components/schemas/RoleSummary' } }, errors:{ type:'array', items:{ $ref:'#/components/schemas/ErrorItem' } } }, additionalProperties:false },
        AnalysisRequest:{ type:'object', required:['schemaVersion','handTileIds'], properties:{ schemaVersion:{ type:'string' }, handTileIds:{ type:'array', minItems:8, maxItems:9, uniqueItems:true, description:'8または9枚のみ有効です。', items:{ type:'string' } }, visibleTileIds:{ type:'array', uniqueItems:true, items:{ type:'string' } }, thoughtTileIds:{ type:'array', uniqueItems:true, items:{ type:'string' } }, disabledRoleIds:{ type:'array', uniqueItems:true, items:{ type:'string' } }, customRoles:{ type:'array', items:{ type:'object', additionalProperties:true } }, isOya:{ type:'boolean' } }, additionalProperties:false },
        AnalysisResponse:{ type:'object', required:['schemaVersion','ok','errors'], properties:{ schemaVersion:{ type:'string' }, ok:{ type:'boolean' }, errors:{ type:'array', items:{ $ref:'#/components/schemas/ErrorItem' } }, normalizedInput:{ type:'object', additionalProperties:true }, winningTiles:{ type:'array', items:{ type:'object', additionalProperties:true } }, discardCandidates:{ type:'array', items:{ type:'object', additionalProperties:true } }, currentWin:{ type:['object','null'], additionalProperties:true } }, additionalProperties:true }
      }
    }
  };
}

export { PRODUCTION_URL };
