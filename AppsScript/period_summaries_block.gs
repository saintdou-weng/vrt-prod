

/* ═══════════════════════════════════════════════════════════════
   v4.3 雙語期間摘要 BILINGUAL PERIOD SUMMARIES（日／週／月／年 · Day / Week / Month / Year）
   - 文字由共用的 vrt-tg-summary-v1.js 產生（build_v43.py 會把它貼在這段前面）：
     網頁上每個模組的「✈️ Telegram」按鈕與這裡的機器人送出的是同一份文字
   - 直接讀 Smart Sync 的月份桶（只讀需要的月份），不再依賴上傳當天算好的 summary
     （v4.2 的車縫／裁剪摘要只看「今天」，上傳日沒有資料就永遠顯示 0）
   - 中文／English 同一則訊息；HTML parse_mode，所有資料文字一律 escape；
     若 Telegram 拒收 HTML，自動改純文字重送，確保「能發出」
   - 每則摘要底部：日／週／月／年 ＋ ◀ 上期／📍 最新／下期 ▶ 按鈕，按了原地更新（不洗版）
   - /day /week /month /year：全部門一頁摘要（digest），再按按鈕看單一部門明細
   - 4096 字元保護：超長自動在換行處截短並註明
   - 期間規則：日＝最近有資料的一天；週＝含該日的週（週一起算）；月／年同理；排單以今天為準
═══════════════════════════════════════════════════════════════ */
const TGS = VRTTgSummary;                       // shared builders (vrt-tg-summary-v1.js)
const PERIODS = TGS.PERIODS;
const PERIOD_LABEL = TGS.PERIOD_LABEL;
// callback key → summary kind + which cloud buckets to read
const PERIOD_TOOLS = {
  sew    : { kind:'sewing',     tool:'sewing',     prefixes:['m'] },
  cut    : { kind:'cutting',    tool:'cutting',    prefixes:['m'] },
  qcsum  : { kind:'qc',         tool:'qc',         prefixes:['m','p:kpi'] },
  sp     : { kind:'spareparts', tool:'spareparts', prefixes:['p:maint_needle','p:maint_part','m'] },
  plansum: { kind:'prodplan',   tool:'prodplan',   prefixes:['m'], anchor:'today' },
  mshipsum:{ kind:'monthship',  tool:'monthship',  prefixes:['m'], anchor:'today' },
  ship   : { kind:'shipping',   tool:'shipping',   prefixes:['all'], anchor:'today' },
  ord    : { kind:'orders',     tool:'orders',     prefixes:['all'], anchor:'today' },
};
const DIGEST_KEYS = ['sew','cut','qcsum','sp','plansum'];
const PERIOD_CMD = { '/day':'day', '/week':'week', '/month':'month', '/year':'year', '/today':'day' };
const esc_ = TGS.esc;
function todayYmd_(){ return Utilities.formatDate(new Date(),CFG.TZ,'yyyy-MM-dd'); }
function periodOf_(period,anchor){ return TGS.periodOf(period,anchor,todayYmd_()); }

// ─── 讀桶：只讀期間涉及的月份桶（prefixes 'all' = 讀全部桶，給沒有日期分桶的工具） ──
function rowDate_(r){ const v=r&&r._vrtEntity&&r._vrtValue?r._vrtValue:r; return String((v&&(v.date||v.start||v.startDate))||'').slice(0,10); }
function bucketKeysFor_(prefixes,mm){ return prefixes.map(p=>p==='m'?'m:'+mm:p+'_'+mm); }
function periodRows_(tool,prefixes,P,prev){
  const m=readSmartManifest_(tool);if(!m)return {manifest:null,rows:[],missing:[]};
  const rows=[],missing=[];let keys;
  if(prefixes[0]==='all')keys=Object.keys(m.buckets);
  else{const months=[...new Set(TGS.monthsIn(P).concat(prev?TGS.monthsIn(prev):[]))].sort();keys=[];for(const mm of months)for(const k of bucketKeysFor_(prefixes,mm))if(m.buckets[k])keys.push(k)}
  for(const k of keys){const b=m.buckets[k],raw=loadFromDrive(smartBucketName_(tool,b.source,k));if(!raw){missing.push(k);continue}for(const r of JSON.parse(raw))rows.push(r)}
  return {manifest:m,rows,missing};
}
// 最近有資料的日期（≤ 今天）：從最新月份桶往前找，最多看 3 個月
function latestDataDate_(tool,prefixes){
  const m=readSmartManifest_(tool);if(!m)return '';const today=todayYmd_(),thisMonth=today.slice(0,7);
  const months=[...new Set(Object.keys(m.buckets).map(k=>{const x=k.match(/^(?:m:|p:[a-z_]+_)(\d{4}-\d{2})$/);return x?x[1]:''}).filter(x=>x&&x<=thisMonth))].sort().reverse().slice(0,3);
  for(const mm of months){let best='';for(const k of bucketKeysFor_(prefixes,mm)){const b=m.buckets[k];if(!b)continue;const raw=loadFromDrive(smartBucketName_(tool,b.source,k));if(!raw)continue;for(const r of JSON.parse(raw)){const d=rowDate_(r);if(d&&d<=today&&d>best)best=d}}if(best)return best}
  return '';
}
// 把雲端桶列轉成共用 builder 的資料形狀（拆掉 envelope）
function shapeRows_(kind,rows,manifest){
  const val=r=>r._vrtValue||r;
  if(kind==='qc')return {records:rows.filter(r=>!r._vrtEntity),kpi:rows.filter(r=>r._vrtEntity==='qc.kpi').map(val)};
  if(kind==='spareparts')return {needle:rows.filter(r=>r._vrtEntity==='maintenance.needleChanges').map(val),part:rows.filter(r=>r._vrtEntity==='maintenance.partChanges').map(val),txns:rows.filter(r=>!r._vrtEntity)};
  if(kind==='orders'){const meta=manifest&&manifest.meta||{},idb=meta.idbData||{};const w=rows.filter(r=>r._vrtEntity==='orders.weekly').map(val),h=rows.filter(r=>r._vrtEntity==='orders.header').map(val);return {lines:rows.filter(r=>!r._vrtEntity),headers:h.length?h:(idb.po_headers||[]),weekly:w.length?w:(idb.weekly_snapshots||[])}}
  return rows.filter(r=>!r._vrtEntity);
}
function missingNote_(R){ return R&&R.missing&&R.missing.length?'\n⚠️ 雲端缺檔 Missing cloud buckets: '+esc_(R.missing.join(', ')):''; }

// ─── 組訊息＋鍵盤 ──────────────────────────────────────────
function resolveAnchor_(T,anchor){
  if(/^\d{4}-\d{2}-\d{2}$/.test(anchor||''))return anchor;
  if(T.anchor==='today'||T.prefixes[0]==='all')return todayYmd_();
  return latestDataDate_(T.tool,T.prefixes)||todayYmd_();
}
function periodSummary_(cb,period,anchor){
  const T=PERIOD_TOOLS[cb];if(!T)return null;period=PERIODS.indexOf(period)>=0?period:'day';const K=TGS.KINDS[T.kind];
  const m=readSmartManifest_(T.tool);
  if(!m)return {text:K.icon+' <b>'+esc_(K.zh)+' '+esc_(K.en)+'</b>\n⚠️ 尚未用 Smart Sync 推送到雲端 / Not pushed to the cloud yet（請在網頁按「☁ 推送」 · press ☁ Push in the web app）',markup:periodKeyboard_(cb,period,todayYmd_())};
  anchor=resolveAnchor_(T,anchor);const P=periodOf_(period,anchor),prev=periodOf_(period,P.prevAnchor);
  const R=periodRows_(T.tool,T.prefixes,P,prev);
  const built=TGS.build(T.kind,shapeRows_(T.kind,R.rows,m),period,anchor,{today:todayYmd_(),metaLine:'雲端更新 Cloud updated: '+esc_(fmtT(m.updatedAt))+' · 雲端記錄 rows: '+TGS.N(m.recordCount)});
  return {text:tgClip_(built.text+missingNote_(R)),markup:periodKeyboard_(cb,period,anchor),built};
}
function periodKeyboard_(cb,period,anchor){
  const P=periodOf_(period,anchor);
  return {inline_keyboard:[
    PERIODS.map(p=>({text:(p===period?'● ':'')+PERIOD_LABEL[p].zh+' '+PERIOD_LABEL[p].en,callback_data:'s:'+cb+':'+p+':'+anchor})),
    [{text:'◀ 上期 Prev',callback_data:'s:'+cb+':'+period+':'+P.prevAnchor},{text:'📍 最新 Latest',callback_data:'s:'+cb+':'+period+':latest'},{text:'下期 Next ▶',callback_data:'s:'+cb+':'+period+':'+P.nextAnchor}],
    [{text:'📆 全部門 Digest',callback_data:'d:'+period+':'+anchor},{text:'📋 摘要選單 Menu',callback_data:'m:sum:0'}],
  ]};
}
// 全部門一頁摘要：每個部門 2～3 行，按鈕可展開明細
function digestSummary_(period,anchor){
  period=PERIODS.indexOf(period)>=0?period:'day';const parts=[],buttons=[];const useAnchor=/^\d{4}-\d{2}-\d{2}$/.test(anchor||'')?anchor:'';
  let headAnchor='';
  for(const cb of DIGEST_KEYS){const T=PERIOD_TOOLS[cb],K=TGS.KINDS[T.kind];const m=readSmartManifest_(T.tool);
    if(!m){parts.push(K.icon+' <b>'+esc_(K.zh)+' '+esc_(K.en)+'</b>：尚未同步 not synced');continue}
    const a=useAnchor||resolveAnchor_(T,'');if(!headAnchor&&T.anchor!=='today')headAnchor=a;const P=periodOf_(period,a),prev=periodOf_(period,P.prevAnchor);
    const R=periodRows_(T.tool,T.prefixes,P,prev);const built=TGS.build(T.kind,shapeRows_(T.kind,R.rows,m),period,a,{today:todayYmd_(),footer:''});
    const brief=built.body.split('\n').filter(l=>l.trim()&&!/^\s*•/.test(l)&&!/^(🏭|👕|👤|Top 3|▶)/.test(l.trim())).slice(0,3).join('\n');
    parts.push(K.icon+' <b>'+esc_(K.zh)+' '+esc_(K.en)+'</b> · '+esc_(P.label)+'\n'+brief);buttons.push({text:K.icon+' '+K.zh,callback_data:'s:'+cb+':'+period+':'+a})}
  const P0=periodOf_(period,useAnchor||headAnchor||todayYmd_());
  const text='📆 <b>VRT '+esc_(PERIOD_LABEL[period].zh+'摘要 '+PERIOD_LABEL[period].en+' digest')+'</b> · '+esc_(P0.label)+'\n'+esc_(fmtT(new Date().toISOString()))+'\n\n'+parts.join('\n\n')+'\n\n👆 按部門看明細 tap a department for details';
  const rows=[];for(let i=0;i<buttons.length;i+=3)rows.push(buttons.slice(i,i+3));
  rows.push(PERIODS.map(p=>({text:(p===period?'● ':'')+PERIOD_LABEL[p].zh+' '+PERIOD_LABEL[p].en,callback_data:'d:'+p+':'+(useAnchor||'latest')})));
  rows.push([{text:'◀ 上期 Prev',callback_data:'d:'+period+':'+P0.prevAnchor},{text:'📍 最新 Latest',callback_data:'d:'+period+':latest'},{text:'下期 Next ▶',callback_data:'d:'+period+':'+P0.nextAnchor}]);
  return {text:tgClip_(text),markup:{inline_keyboard:rows}};
}
// ─── 傳送（HTML，失敗改純文字重送）─────────────────────────
function tgClip_(text){ return TGS.clip(text,4000); }
function tgApi_(method,payload){ const res=UrlFetchApp.fetch(TG()+'/'+method,{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify(payload)});let body={};try{body=JSON.parse(res.getContentText()||'{}')}catch(_){}return body; }
function tgSendHtml_(chatId,text,markup){
  const base={chat_id:chatId,text:tgClip_(text),parse_mode:'HTML',disable_web_page_preview:true};if(markup)base.reply_markup=markup;
  let r=tgApi_('sendMessage',base);
  if(!r.ok){console.warn('Telegram HTML rejected, resending as plain text: '+r.description);const plain=Object.assign({},base,{text:tgClip_(TGS.plain(text))});delete plain.parse_mode;r=tgApi_('sendMessage',plain)}
  return r;
}
function tgEditHtml_(chatId,messageId,text,markup){
  const base={chat_id:chatId,message_id:messageId,text:tgClip_(text),parse_mode:'HTML',disable_web_page_preview:true};if(markup)base.reply_markup=markup;
  let r=tgApi_('editMessageText',base);
  if(!r.ok&&/not modified/i.test(r.description||''))return r;
  if(!r.ok){console.warn('Telegram edit failed ('+r.description+'), sending a new message instead');r=tgSendHtml_(chatId,text,markup)}
  return r;
}
// 手動／時間觸發用：sendPeriodSummary('sew','week') 或 sendDigest('day')；chatId 省略＝CFG.CHAT_ID
function sendPeriodSummary(cb,period,chatId){ const m=periodSummary_(cb,period||'day','');if(!m)throw new Error('Unknown summary key: '+cb);return tgSendHtml_(chatId||CFG.CHAT_ID,m.text,m.markup); }
function sendDigest(period,chatId){ const m=digestSummary_(period||'day','');return tgSendHtml_(chatId||CFG.CHAT_ID,m.text,m.markup); }
function sendDailyDigest(){ return sendDigest('day'); }
function sendWeeklyDigest(){ return sendDigest('week'); }
function sendMonthlyDigest(){ return sendDigest('month'); }
// 測試／診斷：不發訊息，只回傳四個期間的文字
function previewPeriodSummaries(cb){ const out={};PERIODS.forEach(p=>{const m=periodSummary_(cb||'sew',p,'');out[p]=m&&m.text});console.log(JSON.stringify(out,null,2));return out; }

// ─── 一次性檢查／修復 Telegram 設定（手動在編輯器執行）────────
// ensurePollingTrigger()：pollTelegram 每分鐘觸發器不存在就建立（已存在則不重複建）
function ensurePollingTrigger(){ const has=ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='pollTelegram');if(!has)ScriptApp.newTrigger('pollTelegram').timeBased().everyMinutes(1).create();return {created:!has,pollTrigger:true}; }
// checkTelegramSetup()：回報觸發器、Bot 名稱、群組名稱、offset、/exec 網址；不發訊息
function checkTelegramSetup(){ const triggers=ScriptApp.getProjectTriggers().map(t=>t.getHandlerFunction());const me=tgApi_('getMe',{});const chat=tgApi_('getChat',{chat_id:CFG.CHAT_ID});
  const r={backendVersion:productionCapabilities_().backendVersion,pollTrigger:triggers.indexOf('pollTelegram')>=0,triggers,bot:me.ok?'@'+me.result.username:('ERROR '+me.description),group:chat.ok?chat.result.title:('ERROR '+chat.description),offset:PropertiesService.getScriptProperties().getProperty('tg_offset')||'0',webAppUrl:ScriptApp.getService().getUrl()||'',
    hint:triggers.indexOf('pollTelegram')>=0?'OK：群組打 /prod /prod2 /sum /day 會回應（每分鐘輪詢一次）':'沒有 pollTelegram 觸發器 → 執行 ensurePollingTrigger()'};
  console.log(JSON.stringify(r,null,2));return r; }
