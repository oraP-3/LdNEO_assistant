import { tiles, seriesNames, seriesColors, defaultRoles, groupLabels } from './data.js';
import { evaluateHand, checkMachi, isRoleEnabled, validateCustomRole, SCORE_STEP } from './role-engine.js';
import { analyzeDiscardCandidates } from './position-analyzer.js';
import {
  loadSettings, saveSettings, resetSettings, getAllRoles, setRoleEnabled,
  isEnabled, normalizeCustomRole, upsertCustomRole, deleteCustomRole,
  exportSettings, importSettings, generateCustomRoleId
} from './role-store.js';

const state = {
  selectedHand:[],
  visibleTiles:[],
  thoughtTiles:[],
  activeTab:'muse',
  inputMode:'hand',
  isOya:true,
  settings:loadSettings(tiles),
  roleSearch:'',
  expandedRoleIds:new Set()
};

const editor = {
  roleId:null,
  category:'bonus',
  selectedTileIds:new Set(),
  activeTab:'muse'
};

let toastTimer = null;
let pendingConfirm = null;

const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

function escapeAttr(value) { return escapeHTML(value); }

function allRoles() { return getAllRoles(state.settings); }
function disabledSet() { return new Set(state.settings.disabledRoleIds); }
function calcContext(extra = {}) {
  return {
    roles:allRoles(), disabledRoleIds:disabledSet(), isOya:state.isOya,
    thoughtTiles:state.thoughtTiles, tiles, visibleTiles:state.visibleTiles, ...extra
  };
}

function showToast(message, tone = 'error') {
  const toast = $('toast-message');
  toast.textContent = message;
  toast.classList.toggle('bg-red-600',tone === 'error');
  toast.classList.toggle('bg-emerald-600',tone === 'success');
  toast.classList.toggle('bg-blue-600',tone === 'info');
  toast.classList.remove('-translate-y-20','opacity-0');
  toast.classList.add('translate-y-0','opacity-100');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('translate-y-0','opacity-100');
    toast.classList.add('-translate-y-20','opacity-0');
  },2600);
}

function openConfirm(title,message,onYes) {
  $('confirm-title').textContent = title;
  $('confirm-message').textContent = message;
  pendingConfirm = onYes;
  $('confirm-modal').classList.remove('hidden');
}
function closeConfirm() { pendingConfirm = null; $('confirm-modal').classList.add('hidden'); }

function getShortName(fullName) {
  const shortNames = {
    "μ's ロゴ":"μ's", 'Aqours ロゴ':'Aqours', '虹ヶ咲 ロゴ':'ニジガク',
    'Liella! ロゴ':'Liella', 'ミュージカル ロゴ':'スクミュ', '蓮ノ空 ロゴ':'蓮ノ空',
    'イキヅライブ ロゴ':'イキヅ', '音ノ木坂学院 校章':'音ノ木', '浦の星女学院 校章':'浦女',
    '虹ヶ咲学園 校章':'虹ヶ咲', '結ヶ丘女子 校章':'結女', '椿咲花・滝桜 校章':'椿滝桜',
    '蓮ノ空 校章':'蓮ノ空', 'L高 校章':'L高', 'エマ・ヴェルデ':'エマ',
    'ミア・テイラー':'ミア', 'ウィーン・マルガレーテ':'ウィーン', 'セラス 柳田 リリエンフェルト':'セラス'
  };
  if (shortNames[fullName]) return shortNames[fullName];
  const parts = fullName.split(' ');
  return parts.at(-1);
}

function getMonthOrSchoolText(tile) {
  if (tile.birthMonth) return `${tile.birthMonth}月`;
  if (tile.series === 'musical') {
    if (tile.unit === '椿咲花女子高校') return '椿';
    if (tile.unit === '滝桜女学院') return '滝桜';
  }
  return '';
}

function seriesClassParts(tile) {
  const parts = seriesColors[tile.series].split(' ');
  return { bg:parts[0], border:parts[1], text:parts[2] };
}

function createPaletteTileHTML(tile,{selected=false,disabled=false,overlay='',dataAttribute='data-palette-tile'}={}) {
  const {bg,border} = seriesClassParts(tile);
  let classes = `border sm:border-2 ${border} rounded w-full h-[46px] sm:h-[56px] md:h-16 flex flex-col shadow-sm relative bg-white transition-all overflow-hidden`;
  if (selected) classes += ' ring-4 ring-blue-500';
  else if (!disabled) classes += ' playable hover:scale-105';
  if (disabled) classes += ' opacity-30 grayscale cursor-not-allowed';
  let displayName = escapeHTML(tile.name);
  if (tile.name.includes(' ')) displayName = tile.name.split(' ').map(escapeHTML).join('<br>');
  else if (tile.name.includes('・')) displayName = escapeHTML(tile.name).replace('・','・<br>');
  return `<button type="button" class="${classes}" ${disabled?'disabled':''} ${dataAttribute}="${escapeAttr(tile.id)}">
    <div class="absolute inset-0 opacity-40 ${bg} pointer-events-none"></div>
    ${tile.grade ? `<span class="absolute top-[1px] left-[2px] z-10 text-[10px] sm:text-[12px] text-gray-700 leading-none">${tile.grade}年</span>` : ''}
    ${getMonthOrSchoolText(tile) ? `<span class="absolute top-[1px] right-[2px] z-10 text-[10px] sm:text-[12px] text-gray-700 leading-none">${escapeHTML(getMonthOrSchoolText(tile))}</span>` : ''}
    <div class="flex-grow flex items-center justify-center w-full z-10 mt-3 mb-0.5 px-[2px] overflow-hidden"><span class="font-bold text-center break-words leading-[1.1] text-[9px] sm:text-[10px] md:text-xs">${displayName}</span></div>
    ${overlay}
  </button>`;
}

function createCompactTileHTML(tile,{index=null,extraClasses='',gradeState='none',rightState='none',roleStatus={complete:[],reach:[]},fixedWidth=false}={}) {
  const {bg,border} = seriesClassParts(tile);
  let gradeClass = 'text-gray-700', gradeBg = '';
  if (gradeState === 'reach') { gradeClass='text-yellow-900'; gradeBg='bg-yellow-300 rounded px-1 shadow-[0_0_8px_rgba(250,204,21,1)] z-20 -ml-0.5'; }
  if (gradeState === 'complete') { gradeClass='text-white'; gradeBg='bg-red-500 rounded px-1 shadow-[0_0_8px_rgba(239,68,68,1)] z-20 -ml-0.5'; }
  if (gradeState === 'complete-max') { gradeClass='text-white text-shadow-sm'; gradeBg='rainbow-bg rounded px-1 shadow-[0_0_12px_rgba(255,255,255,0.8)] z-20 -ml-0.5'; }
  let rightClass='text-gray-700', rightBg='';
  if (rightState === 'reach') { rightClass='text-yellow-900'; rightBg='bg-yellow-300 rounded px-1 shadow-[0_0_8px_rgba(250,204,21,1)] z-20 -mr-0.5'; }
  if (rightState === 'complete') { rightClass='text-white'; rightBg='bg-red-500 rounded px-1 shadow-[0_0_8px_rgba(239,68,68,1)] z-20 -mr-0.5'; }
  const attr = index === null ? '' : `data-hand-index="${index}"`;
  const buttonTag = index === null ? 'div' : 'button';
  return `<${buttonTag} type="${index===null?'':'button'}" ${attr} class="border-2 sm:border ${border} rounded ${fixedWidth?'w-[40px] md:w-[50px]':'w-full'} aspect-[2/3] shrink-0 flex flex-col shadow-sm relative bg-white transition-all overflow-hidden ${extraClasses}">
    <div class="absolute inset-0 opacity-40 ${bg} pointer-events-none"></div>
    ${tile.grade ? `<span class="absolute top-0 left-0 font-bold z-10 text-[7px] sm:text-[9px] whitespace-nowrap scale-90 origin-top-left ${gradeClass} ${gradeBg}">${tile.grade}年</span>` : ''}
    ${getMonthOrSchoolText(tile) ? `<span class="absolute top-0 right-0 z-10 text-[7px] sm:text-[9px] whitespace-nowrap font-bold scale-90 origin-top-right ${rightClass} ${rightBg}">${escapeHTML(getMonthOrSchoolText(tile))}</span>` : ''}
    <div class="flex-grow flex items-center justify-center w-full z-10 px-[1px] mt-2.5 sm:mt-3 pb-1"><span class="font-bold text-center break-all sm:break-words leading-tight text-[8px] sm:text-[10px] md:text-xs">${escapeHTML(getShortName(tile.name))}</span></div>
    <div class="w-full flex flex-col items-center justify-end gap-[1px] z-10 min-h-[8px] pb-0.5 px-0.5">
      ${roleStatus.complete.map(name=>`<span class="bg-red-500 text-white text-[5px] sm:text-[6px] font-bold rounded w-full text-center truncate leading-[1.2] shadow-sm">${escapeHTML(name)}</span>`).join('')}
      ${roleStatus.reach.map(name=>`<span class="bg-yellow-300 text-yellow-900 text-[5px] sm:text-[6px] font-bold rounded w-full text-center truncate leading-[1.2] shadow-sm">${escapeHTML(name)}</span>`).join('')}
    </div>
  </${buttonTag}>`;
}

function createSmallTileHTML(tile,isJunkara=false) {
  const {border,text} = seriesClassParts(tile);
  const grade = tile.grade ? `${tile.grade}年` : '';
  const month = getMonthOrSchoolText(tile);
  return `<div class="relative flex items-center h-7 md:h-8 px-1.5 md:px-2 rounded shadow-sm border bg-white ${border} ${text} w-max shrink-0 mt-2 mr-1 ${isJunkara?'opacity-50 grayscale':''}">
    ${isJunkara?'<div class="absolute -top-2 left-1/2 -translate-x-1/2 bg-gray-600 text-white text-[8px] font-bold px-1 rounded-full border border-white z-10 whitespace-nowrap">0枚</div>':''}
    <span class="font-bold text-[10px] md:text-xs truncate leading-none mr-1">${escapeHTML(getShortName(tile.name))}</span>
    ${(grade||month)?`<div class="flex flex-col items-center justify-center text-[6px] md:text-[7px] leading-[1.1] shrink-0 ml-auto pl-1 border-l border-gray-300/50">${grade?`<span>${grade}</span>`:''}${month?`<span>${escapeHTML(month)}</span>`:''}</div>`:''}
  </div>`;
}

function renderControls() {
  $('btn-oya').className = state.isOya ? 'px-2 md:px-3 py-1 text-[10px] md:text-xs font-bold rounded bg-white text-red-600 shadow-sm' : 'px-2 md:px-3 py-1 text-[10px] md:text-xs font-bold rounded text-gray-500 hover:text-gray-700';
  $('btn-ko').className = !state.isOya ? 'px-2 md:px-3 py-1 text-[10px] md:text-xs font-bold rounded bg-white text-blue-600 shadow-sm' : 'px-2 md:px-3 py-1 text-[10px] md:text-xs font-bold rounded text-gray-500 hover:text-gray-700';
  const buttons = {hand:$('btn-mode-hand'),visible:$('btn-mode-visible'),thought:$('btn-mode-thought')};
  Object.values(buttons).forEach(button => button.className='flex-1 py-1.5 md:py-2 text-[10px] md:text-sm font-bold rounded-md text-gray-500 hover:text-gray-700 transition border-2 border-transparent');
  $('area-hand').classList.remove('ring-2','ring-blue-400');
  $('palette-container').classList.remove('border-red-400','border-purple-400','border-gray-300');
  $('hand-overlay').classList.add('hidden');
  if (state.inputMode === 'hand') {
    buttons.hand.classList.add('bg-white','text-blue-600','shadow-sm','border-blue-400');
    $('area-hand').classList.add('ring-2','ring-blue-400');
    $('palette-container').classList.add('border-gray-300');
    $('hand-remove-text').textContent='タップで外す';
    $('hand-remove-text').className='text-[9px] md:text-[10px] text-gray-500 font-bold bg-gray-200 px-1.5 py-0.5 rounded shadow-sm';
  } else if (state.inputMode === 'visible') {
    buttons.visible.classList.add('bg-white','text-red-600','shadow-sm','border-red-400');
    $('palette-container').classList.add('border-red-400');
    $('hand-remove-text').textContent='タップで捨て牌(純カラ)に';
    $('hand-remove-text').className='text-[9px] md:text-[10px] text-red-600 font-bold bg-red-100 px-1.5 py-0.5 rounded shadow-sm border border-red-300';
  } else {
    buttons.thought.classList.add('bg-white','text-purple-600','shadow-sm','border-purple-400');
    $('palette-container').classList.add('border-purple-400');
    $('hand-overlay').classList.remove('hidden');
    $('hand-remove-text').textContent='思想セット(2枚)を選択中';
    $('hand-remove-text').className='text-[9px] md:text-[10px] text-purple-600 font-bold bg-purple-100 px-1.5 py-0.5 rounded shadow-sm border border-purple-300';
  }
}

function renderThoughtArea() {
  if (state.thoughtTiles.length === 0) { $('thought-area').innerHTML='<span class="text-[9px] text-gray-400">未設定</span>'; return; }
  $('thought-area').innerHTML = state.thoughtTiles.map(tile => {
    const {bg,border} = seriesClassParts(tile);
    return `<button type="button" data-remove-thought="${escapeAttr(tile.id)}" class="border ${border} ${bg} rounded px-1.5 py-0.5 text-[9px] md:text-[10px] font-bold text-gray-800 shadow-sm cursor-pointer hover:opacity-70 whitespace-nowrap">${escapeHTML(getShortName(tile.name))}</button>`;
  }).join('');
}

function renderTabs() {
  $('series-tabs').innerHTML = Object.entries(seriesNames).map(([key,name]) => {
    const active = state.activeTab===key;
    return `<button type="button" data-series-tab="${key}" class="px-3 md:px-4 py-1.5 md:py-2 font-bold text-[10px] md:text-sm whitespace-nowrap transition-colors ${active?'bg-white text-blue-600 border-b-2 border-blue-600':'bg-gray-100 text-gray-500 hover:bg-gray-200'}">${escapeHTML(name)}</button>`;
  }).join('');
}

function renderPalette() {
  $('tile-palette').innerHTML = tiles.filter(tile=>tile.series===state.activeTab).map(tile => {
    const inHand=state.selectedHand.some(item=>item.id===tile.id);
    const inVisible=state.visibleTiles.some(item=>item.id===tile.id);
    const inThought=state.thoughtTiles.some(item=>item.id===tile.id);
    if (state.inputMode==='thought') {
      if (inThought) return createPaletteTileHTML(tile,{selected:true,overlay:'<div class="absolute inset-0 flex items-center justify-center pointer-events-none"><span class="text-purple-800 font-black text-[10px] bg-white/90 px-1 rounded shadow-sm border border-purple-300">思想</span></div>'});
      return createPaletteTileHTML(tile);
    }
    if (state.inputMode==='hand') {
      if (inHand) return createPaletteTileHTML(tile,{disabled:true});
      if (inVisible) return createPaletteTileHTML(tile,{disabled:true,overlay:'<div class="absolute inset-0 bg-red-500/20"></div><div class="absolute inset-0 flex items-center justify-center"><span class="text-red-600 font-black text-2xl">×</span></div>'});
      return createPaletteTileHTML(tile);
    }
    if (inHand) return createPaletteTileHTML(tile,{disabled:true});
    if (inVisible) return createPaletteTileHTML(tile,{selected:true,overlay:'<div class="absolute inset-0 bg-red-500/30"></div><div class="absolute inset-0 flex items-center justify-center"><span class="text-red-700 font-black text-3xl">×</span></div>'});
    return createPaletteTileHTML(tile);
  }).join('');
}

function addRoleStatus(map,tileId,type,name) {
  if (!map[tileId]) map[tileId]={complete:[],reach:[]};
  if (!map[tileId][type].includes(name)) map[tileId][type].push(name);
}

function buildRoleStatusMap() {
  const map={};
  const enabledRoles=allRoles().filter(role=>isRoleEnabled(role,disabledSet()));
  const handIds=new Set(state.selectedHand.map(tile=>tile.id));
  const handCharIds=new Set(state.selectedHand.map(tile=>tile.characterId).filter(Boolean));
  for (const role of enabledRoles) {
    if (role.rule?.type==='fixedSet') {
      const keyType=role.rule.keyType||'characterId';
      const handKeys=keyType==='tileId'?handIds:handCharIds;
      const matched=role.rule.requiredKeys.filter(key=>handKeys.has(key));
      const needed=role.rule.requiredCount;
      const status=matched.length>=needed?'complete':matched.length===needed-1&&needed>1?'reach':null;
      if (!status) continue;
      for (const tile of state.selectedHand) {
        const key=keyType==='tileId'?tile.id:tile.characterId;
        if (key&&role.rule.requiredKeys.includes(key)) addRoleStatus(map,tile.id,status,role.name);
      }
    } else if (role.rule?.type==='exactHand') {
      const matched=role.rule.requiredTileIds.filter(id=>handIds.has(id));
      const status=matched.length===9?'complete':matched.length===8?'reach':null;
      if (status) matched.forEach(id=>addRoleStatus(map,id,status,role.name));
    } else if (role.rule?.type==='allLogoSchool') {
      const matching=state.selectedHand.filter(tile=>tile.type==='logo'||tile.type==='school');
      const status=matching.length===9?'complete':matching.length===8?'reach':null;
      if (status) matching.forEach(tile=>addRoleStatus(map,tile.id,status,role.name));
    }
  }
  const thoughtRole=enabledRoles.find(role=>role.id==='bonus.thought');
  if (thoughtRole&&state.thoughtTiles.length===2) {
    const matched=state.thoughtTiles.filter(thought=>handIds.has(thought.id));
    const status=matched.length===2?'complete':matched.length===1?'reach':null;
    if (status) matched.forEach(tile=>addRoleStatus(map,tile.id,status,'思想'));
  }
  return map;
}

function gradeHighlight(tile,counts) {
  if (!tile.grade) return 'none';
  const regular=`bonus.grade.${tile.grade}`;
  const complete=`bonus.grade.${tile.grade}.complete`;
  const count=counts[tile.grade]||0;
  if (count>=9&&isEnabled(state.settings,complete)) return 'complete-max';
  if (count>=5&&isEnabled(state.settings,regular)) return 'complete';
  if (count===4&&isEnabled(state.settings,regular)) return 'reach';
  if (count===8&&!isEnabled(state.settings,regular)&&isEnabled(state.settings,complete)) return 'reach';
  return 'none';
}

function rightHighlight(tile,monthCounts,musicalCounts) {
  if (tile.birthMonth) {
    const roleId=`bonus.month.${tile.birthMonth}`;
    if (!isEnabled(state.settings,roleId)) return 'none';
    const count=monthCounts[tile.birthMonth]||0;
    if (count>=3) return 'complete';
    if (count===2) return 'reach';
  }
  if (tile.series==='musical'&&tile.unit) {
    const role=allRoles().find(item=>item.group==='unit'&&item.name===tile.unit);
    if (!role||!isEnabled(state.settings,role.id)) return 'none';
    const count=musicalCounts[tile.unit]||0;
    if (count>=role.rule.requiredCount) return 'complete';
    if (count===role.rule.requiredCount-1) return 'reach';
  }
  return 'none';
}

function renderHand() {
  const badge=$('hand-count-badge');
  badge.textContent=`${state.selectedHand.length} / 9 枚`;
  badge.className=state.selectedHand.length>=9?'bg-red-100 text-red-800 px-2 py-0.5 rounded text-[10px] md:text-xs shadow-sm':'bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] md:text-xs shadow-sm';
  if (state.selectedHand.length===0) {
    $('selected-hand').innerHTML='<div class="col-span-9 text-gray-400 text-xs md:text-sm font-bold w-full text-center py-3">パレットから選択してください<br>（鳴き牌も含めて入力）</div>';
    return;
  }
  const monthCounts={},gradeCounts={},musicalCounts={};
  state.selectedHand.forEach(tile=>{
    if (tile.birthMonth) monthCounts[tile.birthMonth]=(monthCounts[tile.birthMonth]||0)+1;
    if (tile.grade) gradeCounts[tile.grade]=(gradeCounts[tile.grade]||0)+1;
    if (tile.series==='musical'&&tile.unit) musicalCounts[tile.unit]=(musicalCounts[tile.unit]||0)+1;
  });
  const statusMap=buildRoleStatusMap();
  let html=state.selectedHand.map((tile,index)=>{
    let extra='pop-in hover:scale-105 cursor-pointer';
    if (state.inputMode==='visible') extra+=' ring-2 ring-red-300';
    if (state.inputMode==='thought') extra+=' opacity-50 grayscale pointer-events-none';
    return createCompactTileHTML(tile,{index,extraClasses:extra,gradeState:gradeHighlight(tile,gradeCounts),rightState:rightHighlight(tile,monthCounts,musicalCounts),roleStatus:statusMap[tile.id]||{complete:[],reach:[]}});
  }).join('');
  for(let i=state.selectedHand.length;i<9;i+=1) html+='<div class="w-full aspect-[2/3] border-2 border-dashed border-gray-300 rounded flex items-center justify-center shrink-0 opacity-50 bg-gray-100"></div>';
  $('selected-hand').innerHTML=html;
}

function renderResult() {
  const header=$('result-header'), body=$('result-body');
  if (state.selectedHand.length<8) {
    header.className='bg-slate-800 text-white font-bold p-1.5 md:p-2 text-center text-xs md:text-sm shrink-0';
    header.textContent='判定結果';
    body.innerHTML='<div class="h-full flex items-center justify-center text-gray-400 text-xs md:text-sm text-center">手牌を8枚（待ち確認）<br>または9枚（アガリ確認）選択すると<br>ここに結果が表示されます</div>';
    return;
  }
  if (state.selectedHand.length===8) {
    const machi=checkMachi(state.selectedHand,calcContext());
    const badgeText=machi.count>0&&machi.availableCount===0?'残り 0 枚 (純カラ)':`残り ${machi.availableCount} 枚`;
    header.className='bg-blue-600 text-white font-bold p-1.5 md:p-2 text-center text-xs md:text-sm shrink-0 flex justify-between px-4';
    header.innerHTML=`<span>待ち牌確認（8枚）</span><span class="${machi.availableCount>0?'bg-blue-800':'bg-red-500'} px-2 rounded-full shadow-sm">${badgeText}</span>`;
    if (machi.groups.length===0) {
      body.innerHTML='<div class="h-full flex flex-col items-center justify-center text-red-500 font-bold text-center gap-2"><span class="text-4xl">💦</span>アガれる待ち牌はありません。<br>（役がない、または基本条件を満たしていません）</div>';
      return;
    }
    body.innerHTML=machi.groups.map(group=>{
      group.tiles.sort((a,b)=>a.isJunkara===b.isJunkara?0:a.isJunkara?1:-1);
      const available=group.tiles.some(item=>!item.isJunkara);
      return `<div class="${available?'bg-white border-blue-400':'bg-gray-100 border-gray-300 opacity-90'} p-2 rounded shadow-sm border-l-4 flex flex-col shrink-0">
        <div class="flex justify-between items-end border-b border-gray-200 pb-1 mb-1">
          <div class="text-sm md:text-lg font-black ${available?'text-red-600':'text-gray-500'} leading-none">${group.score.toLocaleString()} ジャラ ${available?'':'<span class="text-[8px] bg-gray-500 text-white px-1 py-0.5 rounded align-middle ml-1">出アガリ不可</span>'}</div>
          <div class="text-[9px] md:text-xs text-gray-600 font-bold ml-2 text-right">${escapeHTML(group.yakuText)}</div>
        </div>
        <div class="flex flex-wrap gap-x-1 mt-1">${group.tiles.map(item=>createSmallTileHTML(item.tile,item.isJunkara)).join('')}</div>
      </div>`;
    }).join('');
    return;
  }

  const result=evaluateHand(state.selectedHand,calcContext());
  const currentScore=result.canAgari?result.totalScore:0;
  let agariHtml='';
  if (result.canAgari) {
    header.className='bg-red-600 text-white font-bold p-1.5 md:p-2 text-center text-xs md:text-sm shrink-0 flex justify-between px-4';
    header.innerHTML='<span>アガリ成立！</span>';
    agariHtml=`<div class="bg-yellow-50 p-2 md:p-3 rounded shadow-sm border-2 border-yellow-400 text-center flex flex-col items-center mb-2 md:mb-4">
      <div class="text-2xl md:text-3xl font-black text-red-600 mb-1 md:mb-2 drop-shadow-sm">${result.totalScore.toLocaleString()} ジャラ</div>
      <ul class="text-xs md:text-sm text-gray-700 font-bold text-left bg-white px-4 py-2 rounded border border-yellow-200 inline-block w-full">${result.matchedRoles.map(role=>`<li class="ml-4 list-disc">${escapeHTML(role.name)} (${role.score.toLocaleString()})</li>`).join('')}</ul>
    </div>`;
  } else {
    header.className='bg-gray-600 text-white font-bold p-1.5 md:p-2 text-center text-xs md:text-sm shrink-0';
    header.innerHTML='<span>アガリ不成立</span>';
    const reason=result.reason==='basic'?'基本役（1シリーズ、または<br>3シリーズ）が完成していません。':'基本役は完成していますが、<br>加点役がありません。<br><span class="text-[10px] text-red-500 mt-1 inline-block">※アガるには加点役が1つ以上必要です</span>';
    agariHtml=`<div class="bg-gray-100 p-2 rounded text-center text-gray-600 font-bold mb-2 border border-gray-300">${reason}</div>`;
  }

  let candidates=analyzeDiscardCandidates(state.selectedHand,calcContext()).candidates.map(candidate=>{
    const availableTiles=candidate.winningTiles.filter(item=>!item.isJunkara);
    const scoreTiles=availableTiles.length>0?availableTiles:candidate.winningTiles;
    const maxScore=scoreTiles.length>0?Math.max(...scoreTiles.map(item=>item.totalScore)):0;
    return {...candidate,hasAvailable:availableTiles.length>0,maxScore};
  });
  let globalMaxScore=0,globalMaxAvailable=0;
  candidates.forEach(item=>{if(item.hasAvailable){globalMaxScore=Math.max(globalMaxScore,item.maxScore);globalMaxAvailable=Math.max(globalMaxAvailable,item.availableWinningTileCount);}});
  candidates.sort((a,b)=>{
    if(a.hasAvailable!==b.hasAvailable)return a.hasAvailable?-1:1;
    const abest=(a.maxScore===globalMaxScore&&a.maxScore>0)||(a.availableWinningTileCount===globalMaxAvailable&&globalMaxAvailable>0);
    const bbest=(b.maxScore===globalMaxScore&&b.maxScore>0)||(b.availableWinningTileCount===globalMaxAvailable&&globalMaxAvailable>0);
    if(abest!==bbest)return abest?-1:1;
    return b.maxScore-a.maxScore||b.availableWinningTileCount-a.availableWinningTileCount;
  });
  let assist='<div class="font-bold text-gray-700 text-xs md:text-sm mb-1.5 border-b-2 border-gray-300 pb-0.5">どれか1枚を捨てた場合の待ち牌候補</div>';
  if(candidates.length===0) assist+='<div class="text-[10px] md:text-xs text-gray-500 text-center py-2">切り牌候補を解析できません。</div>';
  else candidates.forEach(item=>{
    const all=item.winningTiles.map(obj=>({
      tile:obj.tile,
      isJunkara:obj.isJunkara,
      score:obj.totalScore,
      yakuText:obj.matchedRoles.map(role=>role.name).join(', ')
    }));
    all.sort((a,b)=>a.isJunkara!==b.isJunkara?(a.isJunkara?1:-1):b.score-a.score);
    const highest=item.hasAvailable&&item.maxScore===globalMaxScore&&item.maxScore>0;
    const widest=item.hasAvailable&&item.availableWinningTileCount===globalMaxAvailable&&globalMaxAvailable>0;
    const badges=[];
    if(currentScore>0&&item.maxScore>currentScore)badges.push('<span class="bg-red-500 text-white text-[8px] md:text-[9px] px-1.5 py-0.5 rounded shadow-sm animate-pulse font-black whitespace-nowrap">点数UP！</span>');
    if(highest&&widest)badges.push('<span class="bg-orange-500 text-white text-[8px] md:text-[9px] px-1.5 py-0.5 rounded shadow-sm font-black border border-orange-600 whitespace-nowrap">最高打点 & 最広待ち</span>');
    else {if(highest)badges.push('<span class="bg-yellow-400 text-yellow-900 text-[8px] md:text-[9px] px-1.5 py-0.5 rounded shadow-sm font-black border border-yellow-500 whitespace-nowrap">最高打点</span>');if(widest)badges.push('<span class="bg-blue-500 text-white text-[8px] md:text-[9px] px-1.5 py-0.5 rounded shadow-sm font-black border border-blue-600 whitespace-nowrap">最広待ち</span>');}
    let wrapper='flex items-center p-1.5 md:p-2 rounded shadow-sm border mb-1.5 ';
    if(!item.hasAvailable)wrapper+='bg-gray-100 border-gray-300 opacity-80';
    else if(currentScore>0&&item.maxScore>currentScore)wrapper+='bg-red-50 border-red-300 ring-1 ring-red-300';
    else if(highest||widest)wrapper+='bg-yellow-50 border-yellow-400 ring-1 ring-yellow-400';
    else wrapper+='bg-white border-gray-200';
    const scoreText=item.winningTiles.length===0?'直接のアガリ待ちなし':`${item.hasAvailable?'最大 ':'(純カラ) 最大 '}${item.maxScore.toLocaleString()}`;
    const waitHtml=all.length>0
      ? `<div class="flex flex-wrap items-center">${all.slice(0,5).map(obj=>createSmallTileHTML(obj.tile,obj.isJunkara)).join('')}${all.length>5?`<div class="text-[9px] text-gray-500 ml-1 self-end mb-1 whitespace-nowrap">他 ${all.length-5}種</div>`:''}</div>
        <div class="text-[8px] md:text-[9px] text-gray-500 leading-snug mt-1">${all.slice(0,3).map(obj=>`<div>${escapeHTML(getShortName(obj.tile.name))}: ${obj.score.toLocaleString()} / ${escapeHTML(obj.yakuText)}</div>`).join('')}${all.length>3?`<div>他 ${all.length-3}件の成立役</div>`:''}</div>`
      : '<div class="text-[10px] md:text-xs text-gray-500 py-1">直接のアガリ待ちなし</div>';
    assist+=`<div class="${wrapper}">
      <div class="flex flex-col items-center mr-2 md:mr-3 shrink-0"><span class="text-[8px] text-gray-500 font-bold mb-0.5">これを捨てる</span>${createCompactTileHTML(item.discardTile,{fixedWidth:true})}</div>
      <div class="flex flex-col flex-grow min-w-0">
        <div class="flex justify-between items-start md:items-center mb-0.5 border-b border-gray-100 pb-0.5 flex-col md:flex-row gap-1 md:gap-0"><div class="flex items-center flex-wrap gap-y-1"><span class="text-[10px] md:text-xs font-bold ${item.availableWinningTileCount>0?'text-blue-700':'text-red-500'} whitespace-nowrap">残り ${item.availableWinningTileCount} 枚</span>${badges.length?`<div class="flex gap-1 ml-1 md:ml-2 flex-wrap">${badges.join('')}</div>`:''}</div><span class="text-[9px] md:text-[10px] ${item.hasAvailable?'text-red-600':'text-gray-500'} font-bold whitespace-nowrap">${scoreText}</span></div>
        ${waitHtml}
      </div>
    </div>`;
  });
  body.innerHTML=agariHtml+assist;
}

function renderApp() { renderControls(); renderThoughtArea(); renderHand(); renderResult(); renderPalette(); }

function addTile(tileId) {
  const tile=tiles.find(item=>item.id===tileId); if(!tile)return;
  if(state.inputMode==='thought'){
    if(state.thoughtTiles.some(item=>item.id===tileId)){state.thoughtTiles=state.thoughtTiles.filter(item=>item.id!==tileId);}
    else if(state.thoughtTiles.length>=2){showToast('思想セットは2枚までです');return;}
    else state.thoughtTiles.push(tile);
  } else if(state.inputMode==='hand'){
    if(state.selectedHand.some(item=>item.id===tileId)||state.visibleTiles.some(item=>item.id===tileId))return;
    if(state.selectedHand.length>=9){showToast('手牌は最大9枚までです');return;}
    state.selectedHand.push(tile); state.selectedHand.sort((a,b)=>a.id.localeCompare(b.id));
  } else {
    if(state.selectedHand.some(item=>item.id===tileId))return;
    if(state.visibleTiles.some(item=>item.id===tileId))state.visibleTiles=state.visibleTiles.filter(item=>item.id!==tileId);
    else {state.visibleTiles.push(tile);state.visibleTiles.sort((a,b)=>a.id.localeCompare(b.id));}
  }
  renderApp();
}

function removeHandTile(index){
  if(state.inputMode==='thought')return;
  if(state.inputMode==='hand')state.selectedHand.splice(index,1);
  else {const [tile]=state.selectedHand.splice(index,1);if(tile&&!state.visibleTiles.some(item=>item.id===tile.id)){state.visibleTiles.push(tile);state.visibleTiles.sort((a,b)=>a.id.localeCompare(b.id));}}
  renderApp();
}

const ROLE_GROUP_ORDER = ['unit','thought','custom','special','month','grade','basic'];
const UNIT_SUBGROUP_ORDER = ['muse','aqours','nijigasaki','liella','hasunosora','musical','ikizulive','cross'];
const UNIT_SUBGROUP_LABELS = {
  muse:"μ's",
  aqours:'Aqours',
  nijigasaki:'虹ヶ咲学園',
  liella:'Liella!',
  hasunosora:'蓮ノ空',
  musical:'スクミュ',
  ikizulive:'イキヅライブ！',
  cross:'越境ユニット'
};

const tileById = new Map(tiles.map(tile=>[tile.id,tile]));
const tileByCharacterId = new Map(tiles.filter(tile=>tile.characterId).map(tile=>[tile.characterId,tile]));

function roleGroupOrder(group){
  const index=ROLE_GROUP_ORDER.indexOf(group);
  return index<0?ROLE_GROUP_ORDER.length:index;
}

function getRoleRuleTiles(role){
  const rule=role.rule||{};
  if(rule.type==='exactHand')return (rule.requiredTileIds||[]).map(id=>tileById.get(id)).filter(Boolean);
  if(rule.type==='fixedSet'){
    const map=rule.keyType==='tileId'?tileById:tileByCharacterId;
    return (rule.requiredKeys||[]).map(key=>map.get(key)).filter(Boolean);
  }
  return [];
}

function getUnitSubgroup(role){
  const series=[...new Set(getRoleRuleTiles(role).map(tile=>tile.series))];
  return series.length===1&&UNIT_SUBGROUP_ORDER.includes(series[0])?series[0]:'cross';
}

function roleSortValue(role,indexMap){
  if(role.group==='month')return Number(role.rule?.value)||99;
  if(role.group==='grade'){
    const grade=Number(role.rule?.value)||99;
    const complete=role.id.endsWith('.complete')?1:0;
    return grade*10+complete;
  }
  if(role.group==='unit'){
    return UNIT_SUBGROUP_ORDER.indexOf(getUnitSubgroup(role))*1000+(indexMap.get(role.id)||0);
  }
  return indexMap.get(role.id)||0;
}

function getRoleTileDetail(role){
  const rule=role.rule||{};
  if(rule.type==='allLogoSchool'){
    return { names:'ロゴ牌・校章牌', condition:`${rule.requiredCount||9}牌すべて`, count:rule.requiredCount||9 };
  }
  const roleTiles=getRoleRuleTiles(role);
  if(roleTiles.length===0)return null;
  const names=roleTiles.map(tile=>getShortName(tile.name)).join('・');
  if(rule.type==='exactHand'){
    return {names,condition:'指定9牌すべて',count:roleTiles.length};
  }
  if(rule.type==='fixedSet'){
    const requiredCount=Number(rule.requiredCount??roleTiles.length);
    const condition=requiredCount===roleTiles.length
      ? `指定${roleTiles.length}牌すべて`
      : `候補${roleTiles.length}牌中${requiredCount}牌以上`;
    return {names,condition,count:roleTiles.length};
  }
  return null;
}

function shouldShowRoleTiles(role){
  return role.group==='unit'||role.group==='custom'||role.category==='standalone';
}

function renderRoleTileDetail(role){
  if(!shouldShowRoleTiles(role))return '';
  const detail=getRoleTileDetail(role);
  if(!detail)return '';
  const expandable=detail.count>6||detail.names.length>36;
  const expanded=state.expandedRoleIds.has(role.id);
  return `<div class="mt-1">
    <div class="role-tile-summary text-[9px] md:text-[10px] leading-relaxed text-gray-600 ${expandable&&!expanded?'is-collapsed':''}">${escapeHTML(detail.names)}</div>
    <div class="flex items-center gap-2 mt-0.5">
      <span class="text-[8px] md:text-[9px] font-bold text-gray-400">${escapeHTML(detail.condition)}</span>
      ${expandable?`<button type="button" data-expand-role="${escapeAttr(role.id)}" class="text-[8px] md:text-[9px] font-bold text-blue-600 hover:underline">${expanded?'閉じる':'全牌を表示'}</button>`:''}
    </div>
  </div>`;
}

function renderRoleRow(role){
  const enabled=isEnabled(state.settings,role.id);
  const typeLabel=role.category==='standalone'?'特殊役':role.category==='base'?'基本役':'加点役';
  return `<div class="flex items-start gap-2 p-2.5 ${enabled?'':'opacity-60'}">
    <button type="button" data-toggle-role="${escapeAttr(role.id)}" aria-pressed="${enabled}" class="role-toggle ${enabled?'is-on':'is-off'} mt-0.5" title="${enabled?'計算対象':'計算対象外'}"></button>
    <div class="flex-grow min-w-0">
      <div class="flex items-baseline justify-between gap-2">
        <div class="font-bold text-xs md:text-sm min-w-0 break-words">${escapeHTML(role.name)}</div>
        <div class="text-[9px] md:text-[10px] text-gray-500 whitespace-nowrap">${role.score.toLocaleString()}ジャラ</div>
      </div>
      <div class="text-[9px] md:text-[10px] text-gray-400">${typeLabel}</div>
      ${renderRoleTileDetail(role)}
      ${role.builtIn?'':`<div class="flex gap-1 mt-1.5 flex-wrap"><button data-edit-role="${escapeAttr(role.id)}" class="px-2 py-1 rounded bg-blue-50 text-blue-700 text-[10px] font-bold">編集</button><button data-duplicate-role="${escapeAttr(role.id)}" class="px-2 py-1 rounded bg-gray-100 text-gray-700 text-[10px] font-bold">複製</button><button data-delete-role="${escapeAttr(role.id)}" class="px-2 py-1 rounded bg-red-50 text-red-700 text-[10px] font-bold">削除</button></div>`}
    </div>
  </div>`;
}

function renderUnitRoleGroup(items){
  const subgroups=new Map(UNIT_SUBGROUP_ORDER.map(key=>[key,[]]));
  items.forEach(role=>subgroups.get(getUnitSubgroup(role)).push(role));
  return [...subgroups.entries()].filter(([,roles])=>roles.length).map(([key,roles])=>`
    <section class="border-t first:border-t-0 border-gray-200">
      <div class="px-3 py-1.5 bg-slate-50 text-[10px] md:text-xs font-black text-gray-600">${escapeHTML(UNIT_SUBGROUP_LABELS[key])} <span class="font-normal text-gray-400">(${roles.length})</span></div>
      <div class="divide-y">${roles.map(renderRoleRow).join('')}</div>
    </section>`).join('');
}

function renderRoleSettings(){
  const query=state.roleSearch.trim().toLowerCase();
  const source=allRoles();
  const indexMap=new Map(source.map((role,index)=>[role.id,index]));
  const roles=source
    .filter(role=>!query||role.name.toLowerCase().includes(query)||getRoleTileDetail(role)?.names.toLowerCase().includes(query))
    .sort((a,b)=>roleGroupOrder(a.group)-roleGroupOrder(b.group)||roleSortValue(a,indexMap)-roleSortValue(b,indexMap));
  const groups=new Map();
  roles.forEach(role=>{if(!groups.has(role.group))groups.set(role.group,[]);groups.get(role.group).push(role);});
  $('role-list').innerHTML=[...groups.entries()].map(([group,items])=>{
    const body=group==='unit'?renderUnitRoleGroup(items):`<div class="divide-y">${items.map(renderRoleRow).join('')}</div>`;
    return `<details open class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"><summary class="cursor-pointer px-3 py-2 bg-gray-50 font-black text-xs md:text-sm text-gray-700">${escapeHTML(groupLabels[group]||group)} <span class="text-gray-400 font-normal">(${items.length})</span></summary>${body}</details>`;
  }).join('')||'<div class="text-center text-gray-400 text-sm py-10">該当する役はありません。</div>';
  const basics=['base.one_series','base.three_series'];
  $('basic-role-warning').classList.toggle('hidden',basics.some(id=>isEnabled(state.settings,id)));
}

function openRoleSettings(){renderRoleSettings();$('role-settings-modal').classList.remove('hidden');document.body.classList.add('modal-open');}
function closeRoleSettings(){if(!$('role-editor-modal').classList.contains('hidden'))return;$('role-settings-modal').classList.add('hidden');document.body.classList.remove('modal-open');}

function setEditorType(category){
  editor.category=category;
  document.querySelectorAll('.role-type-button').forEach(button=>{
    const active=button.dataset.roleType===category;
    button.className=`role-type-button bg-white ${active?(category==='standalone'?'text-purple-700 border-purple-500 ring-1 ring-purple-500':'text-blue-700 border-blue-500 ring-1 ring-blue-500'):'text-gray-500 border-gray-200'} border-2 rounded-lg p-2 font-bold text-xs md:text-sm`;
  });
  $('bonus-condition-panel').classList.toggle('hidden',category==='standalone');
  $('special-description').classList.toggle('hidden',category!=='standalone');
  if(category==='standalone'&&editor.selectedTileIds.size>9){editor.selectedTileIds=new Set([...editor.selectedTileIds].slice(0,9));showToast('特殊役は9枚までのため、先頭の9枚を残しました。','info');}
  renderEditorTabs(); renderEditorPalette(); renderEditorCount(); renderEditorSelectedTiles();
}

function openRoleEditor(role=null,{duplicate=false}={}){
  $('role-editor-error').classList.add('hidden');
  if(role){
    editor.roleId=duplicate?generateCustomRoleId():role.id;
    editor.category=role.category;
    editor.selectedTileIds=new Set(role.category==='standalone'?role.rule.requiredTileIds:role.rule.requiredKeys);
    const firstSelectedTile=tiles.find(tile=>editor.selectedTileIds.has(tile.id));
    editor.activeTab=firstSelectedTile?.series||'muse';
    $('custom-role-name').value=duplicate?`${role.name}（コピー）`:role.name;
    $('custom-role-score').value=role.score;
    if(role.category==='bonus'){
      const allRequired=role.rule.requiredCount===role.rule.requiredKeys.length;
      $('custom-role-condition').value=allRequired?'all':'count';
      $('custom-role-required-count').value=role.rule.requiredCount;
    }
    $('role-editor-title').textContent=duplicate?'役を複製':'役を編集';
  } else {
    editor.roleId=generateCustomRoleId(); editor.category='bonus'; editor.selectedTileIds=new Set(); editor.activeTab='muse';
    $('custom-role-name').value=''; $('custom-role-score').value='90000'; $('custom-role-condition').value='all'; $('custom-role-required-count').value='3'; $('role-editor-title').textContent='役を追加';
  }
  setEditorType(editor.category); updateConditionUI(); renderEditorTabs(); renderEditorPalette(); renderEditorCount(); renderEditorSelectedTiles();
  $('role-editor-modal').classList.remove('hidden'); document.body.classList.add('modal-open');
}
function closeRoleEditor(){ $('role-editor-modal').classList.add('hidden'); if($('role-settings-modal').classList.contains('hidden'))document.body.classList.remove('modal-open'); }

function renderEditorTabs(){
  const selectedCounts={};
  for(const tileId of editor.selectedTileIds){
    const tile=tileById.get(tileId);
    if(tile)selectedCounts[tile.series]=(selectedCounts[tile.series]||0)+1;
  }
  $('editor-series-tabs').innerHTML=Object.entries(seriesNames).map(([key,name])=>{
    const count=selectedCounts[key]||0;
    return `<button type="button" data-editor-series="${key}" class="px-3 md:px-4 py-2 font-bold text-[10px] md:text-sm whitespace-nowrap ${editor.activeTab===key?'bg-white text-blue-600 border-b-2 border-blue-600':'bg-gray-100 text-gray-500'}">${escapeHTML(name)}${count?` <span class="inline-flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-blue-600 text-white text-[8px] align-middle">${count}</span>`:''}</button>`;
  }).join('');
}
function renderEditorPalette(){
  $('editor-tile-palette').innerHTML=tiles.filter(tile=>tile.series===editor.activeTab).map(tile=>{
    const selected=editor.selectedTileIds.has(tile.id);
    const disabled=editor.category==='standalone'&&!selected&&editor.selectedTileIds.size>=9;
    const overlay=selected?'<div class="absolute inset-0 bg-blue-500/15 pointer-events-none"></div><div class="absolute inset-0 flex items-center justify-center pointer-events-none"><span class="bg-blue-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded">選択中</span></div>':'';
    return createPaletteTileHTML(tile,{selected,disabled,overlay,dataAttribute:'data-editor-tile'});
  }).join('');
}
function renderEditorCount(){
  const count=editor.selectedTileIds.size;
  $('editor-selected-count').textContent=editor.category==='standalone'?`${count} / 9枚`:`${count}枚`;
  $('editor-selected-count').className=`rounded-full px-2 py-1 text-xs font-black ${editor.category==='standalone'&&count===9?'bg-purple-100 text-purple-800':'bg-blue-100 text-blue-800'}`;
  if($('custom-role-condition').value==='all')$('custom-role-required-count').value=count||1;
  $('custom-role-required-count').max=Math.min(9,Math.max(1,count));
}
function renderEditorSelectedTiles(){
  const selectedTiles=tiles.filter(tile=>editor.selectedTileIds.has(tile.id)).sort((a,b)=>a.id.localeCompare(b.id));
  if(selectedTiles.length===0){
    $('editor-selected-tiles').innerHTML='<span class="text-[10px] text-gray-400 px-1">まだ指定されていません</span>';
    return;
  }
  $('editor-selected-tiles').innerHTML=selectedTiles.map(tile=>{
    const {bg,border,text}=seriesClassParts(tile);
    return `<button type="button" data-remove-editor-selected="${escapeAttr(tile.id)}" class="shrink-0 inline-flex items-center gap-1 border ${border} ${bg} ${text} rounded-full px-2 py-1 text-[9px] md:text-[10px] font-bold shadow-sm" title="選択解除">${escapeHTML(getShortName(tile.name))}<span class="text-xs leading-none opacity-70">×</span></button>`;
  }).join('');
}

function updateConditionUI(){
  const countMode=$('custom-role-condition').value==='count';
  $('required-count-label').classList.toggle('hidden',!countMode);
  if(!countMode)$('custom-role-required-count').value=Math.max(1,editor.selectedTileIds.size);
}
function editorError(message){$('role-editor-error').textContent=message;$('role-editor-error').classList.remove('hidden');}
function persistEditorRole(role){
  upsertCustomRole(state.settings,role); saveSettings(state.settings); closeRoleEditor(); renderRoleSettings(); renderApp(); showToast('役を保存しました。','success');
}
function saveEditorRole(){
  const selected=[...editor.selectedTileIds];
  const category=editor.category;
  const role=normalizeCustomRole({
    id:editor.roleId, name:$('custom-role-name').value, score:Number($('custom-role-score').value), category,
    rule:category==='standalone'?{requiredTileIds:selected}:{requiredKeys:selected,requiredCount:$('custom-role-condition').value==='all'?selected.length:Number($('custom-role-required-count').value)}
  });
  const validation=validateCustomRole(role,tiles,allRoles());
  if(!validation.valid){editorError(validation.message);return;}
  const sameName=allRoles().find(existing=>existing.id!==role.id&&existing.name===role.name);
  if(sameName){
    openConfirm('同名の役があります',`「${role.name}」という役はすでに登録されています。同じ名前のまま保存しますか？`,()=>{closeConfirm();persistEditorRole(role);});
    return;
  }
  persistEditorRole(role);
}

function exportRoleSettings(){
  const blob=new Blob([exportSettings(state.settings)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const link=document.createElement('a');
  link.href=url; link.download='ldneo-role-settings.json'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  showToast('役設定を書き出しました。','success');
}

function attachEvents(){
  $('btn-oya').addEventListener('click',()=>{state.isOya=true;renderApp();});
  $('btn-ko').addEventListener('click',()=>{state.isOya=false;renderApp();});
  $('btn-mode-hand').addEventListener('click',()=>{state.inputMode='hand';renderApp();});
  $('btn-mode-visible').addEventListener('click',()=>{state.inputMode='visible';renderApp();});
  $('btn-mode-thought').addEventListener('click',()=>{state.inputMode='thought';renderApp();});
  $('series-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-series-tab]');if(button){state.activeTab=button.dataset.seriesTab;renderTabs();renderPalette();}});
  $('tile-palette').addEventListener('click',event=>{const button=event.target.closest('[data-palette-tile]');if(button&&!button.disabled)addTile(button.dataset.paletteTile);});
  $('selected-hand').addEventListener('click',event=>{const button=event.target.closest('[data-hand-index]');if(button)removeHandTile(Number(button.dataset.handIndex));});
  $('thought-area').addEventListener('click',event=>{const button=event.target.closest('[data-remove-thought]');if(button){state.thoughtTiles=state.thoughtTiles.filter(tile=>tile.id!==button.dataset.removeThought);renderApp();}});
  $('clear-hand').addEventListener('click',()=>{if(state.selectedHand.length||state.visibleTiles.length||state.thoughtTiles.length)$('clear-confirm-modal').classList.remove('hidden');});
  $('execute-clear').addEventListener('click',()=>{state.selectedHand=[];state.visibleTiles=[];state.thoughtTiles=[];state.inputMode='hand';$('clear-confirm-modal').classList.add('hidden');renderApp();});
  $('cancel-clear').addEventListener('click',()=>$('clear-confirm-modal').classList.add('hidden'));
  $('open-role-settings').addEventListener('click',openRoleSettings);
  $('close-role-settings').addEventListener('click',closeRoleSettings);
  $('role-search').addEventListener('input',event=>{state.roleSearch=event.target.value;renderRoleSettings();});
  $('role-list').addEventListener('click',event=>{
    const toggle=event.target.closest('[data-toggle-role]');
    if(toggle){const id=toggle.dataset.toggleRole;setRoleEnabled(state.settings,id,!isEnabled(state.settings,id));saveSettings(state.settings);renderRoleSettings();renderApp();return;}
    const expand=event.target.closest('[data-expand-role]');if(expand){const id=expand.dataset.expandRole;if(state.expandedRoleIds.has(id))state.expandedRoleIds.delete(id);else state.expandedRoleIds.add(id);renderRoleSettings();return;}
    const edit=event.target.closest('[data-edit-role]');if(edit){const role=state.settings.customRoles.find(item=>item.id===edit.dataset.editRole);if(role)openRoleEditor(role);return;}
    const duplicate=event.target.closest('[data-duplicate-role]');if(duplicate){const role=state.settings.customRoles.find(item=>item.id===duplicate.dataset.duplicateRole);if(role)openRoleEditor(clone(role),{duplicate:true});return;}
    const del=event.target.closest('[data-delete-role]');if(del){const role=state.settings.customRoles.find(item=>item.id===del.dataset.deleteRole);if(role)openConfirm('役を削除',`「${role.name}」を削除しますか？`,()=>{deleteCustomRole(state.settings,role.id);saveSettings(state.settings);closeConfirm();renderRoleSettings();renderApp();showToast('役を削除しました。','success');});}
  });
  $('add-custom-role').addEventListener('click',()=>openRoleEditor());
  $('close-role-editor').addEventListener('click',closeRoleEditor); $('cancel-role-editor').addEventListener('click',closeRoleEditor);
  document.querySelectorAll('.role-type-button').forEach(button=>button.addEventListener('click',()=>setEditorType(button.dataset.roleType)));
  $('custom-role-condition').addEventListener('change',()=>{updateConditionUI();renderEditorCount();});
  $('editor-series-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-editor-series]');if(button){editor.activeTab=button.dataset.editorSeries;renderEditorTabs();renderEditorPalette();}});
  $('editor-tile-palette').addEventListener('click',event=>{const button=event.target.closest('[data-editor-tile]');if(!button||button.disabled)return;const id=button.dataset.editorTile;if(editor.selectedTileIds.has(id))editor.selectedTileIds.delete(id);else{if(editor.category==='standalone'&&editor.selectedTileIds.size>=9){showToast('特殊役は9枚ちょうどを指定します。');return;}editor.selectedTileIds.add(id);}renderEditorTabs();renderEditorPalette();renderEditorCount();renderEditorSelectedTiles();});
  $('editor-selected-tiles').addEventListener('click',event=>{const button=event.target.closest('[data-remove-editor-selected]');if(!button)return;editor.selectedTileIds.delete(button.dataset.removeEditorSelected);renderEditorTabs();renderEditorPalette();renderEditorCount();renderEditorSelectedTiles();});
  $('score-minus').addEventListener('click',()=>{$('custom-role-score').value=Math.max(SCORE_STEP,Number($('custom-role-score').value||SCORE_STEP)-SCORE_STEP);});
  $('score-plus').addEventListener('click',()=>{$('custom-role-score').value=Number($('custom-role-score').value||0)+SCORE_STEP;});
  $('save-custom-role').addEventListener('click',saveEditorRole);
  $('export-settings').addEventListener('click',exportRoleSettings);
  $('import-settings').addEventListener('click',()=>$('import-settings-file').click());
  $('import-settings-file').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{state.settings=importSettings(await file.text(),tiles);saveSettings(state.settings);renderRoleSettings();renderApp();showToast('役設定を読み込みました。','success');}catch(error){showToast(error.message);}finally{event.target.value='';}});
  $('reset-settings').addEventListener('click',()=>openConfirm('役設定を初期化','追加した役とON/OFF設定をすべて初期状態に戻します。',()=>{state.settings=resetSettings();closeConfirm();renderRoleSettings();renderApp();showToast('役設定を初期化しました。','success');}));
  $('confirm-yes').addEventListener('click',()=>{if(pendingConfirm)pendingConfirm();}); $('confirm-no').addEventListener('click',closeConfirm);
  document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(!$('confirm-modal').classList.contains('hidden'))closeConfirm();else if(!$('role-editor-modal').classList.contains('hidden'))closeRoleEditor();else if(!$('role-settings-modal').classList.contains('hidden'))closeRoleSettings();});
}

renderTabs(); attachEvents(); renderApp();
