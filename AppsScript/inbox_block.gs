/* ═══════════════════════════════════════════════════════════════
   v4.6 Telegram 群組檔案自動進 PROD（修改指令 C）— PROD_Inbox + import_queue
   - 收件方式：沿用 pollTelegram 的 getUpdates 輪詢（規格書 11.2：PROD 機器人保持 polling，不加 webhook、不改 ERP 機器人）。
     handleMsg 收到 document 訊息就呼叫 inboxIntake_()；文字指令完全不變。
   - 檔案 ≤ 20 MB（Bot API getFile 上限）→ 下載 → Drive：VRT_Production_Data/PROD_Inbox/<群組>/<yyyy-MM-dd>/<檔名>
   - 佇列：inbox_queue.json（網頁讀這份）＋ Google Sheet「import_queue」工作表（給人看：群組、傳送者、時間、檔名、Drive ID、模組、狀態）
   - 檔名分流表 INBOX_ROUTES（可用指令碼屬性 INBOX_ROUTES_JSON 追加／覆蓋：[{"re":"regex","module":"..."}]）
   - 同一檔（file_unique_id）只收一次；收到後 setMessageReaction 👍（失敗就略過，不影響收件）
   - 網頁 action：inboxList / inboxFile（base64 下載給該頁原本的解析器）/ inboxDone / inboxRoutes / inboxRetry
   - Email 附件（C.5）：inboxGmailPoll() 每 15 分鐘讀 Gmail 標籤 PROD_Inbox（Outlook 規則自動轉寄到這個信箱）；installInboxGmailTrigger() 安裝
   - 前提：收件的機器人要在群組裡（管理員或關閉 privacy mode：BotFather /setprivacy → Disable），否則群組裡的檔案訊息不會送到機器人
   - 多機器人（2026-10-10）：生產群組裡已經是 @ga_po_adminpw_bot（GA Purchase Order bot），不必再把 PROD 機器人加進每個群組。
     CFG.INBOX_BOTS（只在貼進 Apps Script 的那份 GS 裡，repo 沒有 token）或指令碼屬性 INBOX_BOTS_JSON 列出其他收件機器人；
     inboxPollBots()（installInboxBotsTrigger() 每 30 分鐘，Paul 10-10 指示；之前的 Telegram 收檔排程也是半小時）用各自的 token 輪詢 getUpdates，只取 document 訊息，其餘略過。
     ★ 同一支機器人不能有兩個接收者：若 getWebhookInfo 顯示它有 webhook（別的系統在用），這裡會跳過並記錄，不會 deleteWebhook；
       若舊的 GA 採購 GAS 仍在輪詢同一支機器人，兩邊會互搶更新 — 請先確認那份 GAS 已停用（checkInboxBots() 會列出狀態）。
═══════════════════════════════════════════════════════════════ */
const INBOX_QUEUE_ = 'inbox_queue.json';
const INBOX_SHEET_ = 'import_queue';
const INBOX_MAX_BYTES_ = 20 * 1024 * 1024;
const INBOX_ROUTES = [
  { re:/daily\s*needles?|needles?\s*change|換針/i,                     module:'spareparts',    page:'vrt_spare_parts_v2.html',                       zh:'機修零件（換針）' },
  { re:/spare\s*part|part\s*change|換件/i,                          module:'spareparts',    page:'vrt_spare_parts_v2.html',                       zh:'機修零件（換件）' },
  { re:/final\s*qc|end-?line|top\s*\d?\s*defect|qc\s*inspection/i, module:'qc',            page:'vrt_final_qc_v1.html',                          zh:'Final QC' },
  { re:/weekly\s*open\s*order/i,                                    module:'orders',        page:'orders_v3.html',                                zh:'訂單週報' },
  { re:/monthly\s*shipping\s*schedule/i,                            module:'monthship',     page:'vrt_monthly_shipping_control_center_v1.html',   zh:'月出貨' },
  { re:/all\s*customer\s*statistics/i,                              module:'custstats',     page:'vrt_customer_statistics_control_center_v1.html',zh:'客戶統計' },
  { re:/shipping\s*schedule/i,                                      module:'shipping',      page:'shipping_v2.html',                              zh:'出貨排程' },
  { re:/fabric\s*stock|stock\s*accessor/i,                          module:'fabricstock',   page:'vrt_fabric_stock_control_v1.html',              zh:'布料庫存' },
  { re:/greige\s*inventory/i,                                       module:'fabricdelivery',page:'vrt_fabric_delivery_greige_center_v1.html',     zh:'胚布中心' },
  { re:/cutting\s*plan/i,                                           module:'cuttingplan',   page:'cutting_plan_v2.html',                          zh:'裁剪計劃' },
  { re:/production\s*plan/i,                                        module:'prodplan',      page:'production_plan_capacity_v1.html',              zh:'排單產能' },
  { re:/month(?:l)?y?\s*fg\s*stock|fg\s*stock|fg\s*inventory/i,     module:'fg',            page:'VRT_FG_Inventory_Management_v1.html',           zh:'FG 成品（快照）' },
  { re:/daily\s*output|garment|apron|sewing\s*output/i,             module:'sewing',        page:'sewing_v5.html',                                zh:'車縫' },
  { re:/cutting\s*report|cutting\s*daily/i,                         module:'cutting',       page:'cutting_v3.html',                               zh:'裁剪' },
  { re:/obd|smv\s*update|approved|time\s*study|line\s*balanc/i,     module:'ie',            page:'ie_smv_report_v2_1.html',                       zh:'IE／SMV' },
  { re:/\bpo\s*#?\s*\d{5,}|purchase\s*order/i,                      module:'podelivery',    page:'VRT_PO_Delivery_Control_Center.html',           zh:'PO 交期（採購單）' },
  { re:/statement|invoice|對帳/i,                                   module:'spareparts',    page:'vrt_spare_parts_v2.html',                       zh:'機修零件（對帳單）' },
];
function inboxRoutes_(){
  let extra=[]; try{ const raw=PropertiesService.getScriptProperties().getProperty('INBOX_ROUTES_JSON'); if(raw) extra=JSON.parse(raw).map(x=>({re:new RegExp(x.re,'i'),module:x.module,page:x.page||'',zh:x.zh||x.module,custom:true})); }catch(e){ console.warn('INBOX_ROUTES_JSON invalid: '+e); }
  return extra.concat(INBOX_ROUTES);
}
function inboxRoute_(fileName){ const n=String(fileName||'').replace(/[_\-]+/g,' '); for(const r of inboxRoutes_()){ if(r.re.test(n)) return {module:r.module,page:r.page,zh:r.zh}; } return {module:'unrouted',page:'',zh:'未分類（請在頁面指定）'}; }
/* ── queue storage ── */
function inboxLoad_(){ const raw=loadFromDrive(INBOX_QUEUE_); let q=[]; try{ q=raw?JSON.parse(raw):[]; }catch(_){ q=[]; } return Array.isArray(q)?q:[]; }
function inboxSave_(q){ if(q.length>2000) q=q.slice(-2000); saveToDrive(INBOX_QUEUE_, JSON.stringify(q)); return q; }
function inboxSheet_(){ const ss=getOrCreateSpreadsheet(); let sh=ss.getSheetByName(INBOX_SHEET_); if(!sh){ sh=ss.insertSheet(INBOX_SHEET_); sh.appendRow(['id','received_at','group','sender','file_name','size','drive_id','module','page','status','done_at','done_by','note','chat_id','message_id','file_unique_id','mime','source']); sh.setFrozenRows(1); } return sh; }
function inboxSheetAppend_(e){ try{ inboxSheet_().appendRow([e.id,e.receivedAt,e.group,e.sender,e.fileName,e.size,e.driveId,e.module,e.page,e.status,e.doneAt||'',e.doneBy||'',e.note||'',e.chatId,e.messageId,e.fileUniqueId||'',e.mime||'',e.source||'telegram']); }catch(err){ console.warn('import_queue sheet append failed: '+err); } }
function inboxSheetUpdate_(e){ try{ const sh=inboxSheet_(); const rows=sh.getDataRange().getValues(); for(let i=1;i<rows.length;i++){ if(String(rows[i][0])===String(e.id)){ sh.getRange(i+1,10,1,4).setValues([[e.status,e.doneAt||'',e.doneBy||'',e.note||'']]); return true; } } }catch(err){ console.warn('import_queue sheet update failed: '+err); } return false; }
/* ── Drive folders: PROD_Inbox/<group>/<date>/ under the data folder ── */
function inboxSub_(parent,name){ const it=parent.getFoldersByName(name); return it.hasNext()?it.next():parent.createFolder(name); }
function inboxFolder_(group,date){ const root=inboxSub_(getOrCreateFolder(),'PROD_Inbox'); const g=inboxSub_(root,String(group||'unknown').replace(/[\\/:*?"<>|]/g,'_').slice(0,80)||'unknown'); return inboxSub_(g,date); }
/* ── intake bots: PROD bot (CFG.BOT_TOKEN, via pollTelegram) + extra bots polled by inboxPollBots() ── */
function inboxBots_(){
  const out=[{id:'prod',name:'PROD bot',token:CFG.BOT_TOKEN,main:true}];
  const add=list=>{ (list||[]).forEach((b,i)=>{ if(!b||!b.token) return; const id=String(b.id||String(b.token).split(':')[0]||('bot'+i)); if(out.some(x=>x.id===id||x.token===b.token)) return; out.push({id,name:String(b.name||id),token:String(b.token),main:false}); }); };
  try{ add(CFG.INBOX_BOTS); }catch(_){}
  try{ const raw=PropertiesService.getScriptProperties().getProperty('INBOX_BOTS_JSON'); if(raw) add(JSON.parse(raw)); }catch(e){ console.warn('INBOX_BOTS_JSON invalid: '+e); }
  return out;
}
function tgBot_(token,method,payload){ const res=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify(payload||{})}); let body={}; try{ body=JSON.parse(res.getContentText()||'{}'); }catch(_){} return body; }
function inboxMaxAgeDays_(){ return Number(PropertiesService.getScriptProperties().getProperty('INBOX_MAX_AGE_DAYS')||3); }
// 每 30 分鐘：其他收件機器人各自輪詢（不動 PROD 機器人的 pollTelegram）
function inboxPollBots(){
  const bots=inboxBots_().filter(b=>!b.main); if(!bots.length) return {bots:0};
  let lock=null; try{ lock=LockService.getScriptLock(); if(!lock.tryLock(3000)) return {locked:true};
    const props=PropertiesService.getScriptProperties(); const report={};
    for(const bot of bots){ const key='inbox_tg_offset_'+bot.id; const r={files:0,skipped:0,updates:0};
      try{
        const wh=tgBot_(bot.token,'getWebhookInfo',{}); if(wh.ok&&wh.result&&wh.result.url){ r.webhook=wh.result.url; r.note='webhook owned by another system — not polled (no deleteWebhook)'; report[bot.id]=r; continue; }
        let offset=parseInt(props.getProperty(key)||'0',10)||0; const data=tgBot_(bot.token,'getUpdates',{offset:offset,timeout:0,limit:100});
        if(!data.ok||!Array.isArray(data.result)){ r.error=data.description||'getUpdates failed'; report[bot.id]=r; continue; }
        const minTs=Date.now()/1000-inboxMaxAgeDays_()*86400;
        for(const upd of data.result){ offset=upd.update_id+1; r.updates++; const m=upd.message||upd.channel_post; if(!m||!m.document) continue; if(Number(m.date||0)<minTs){ r.skipped++; continue; }
          try{ const e=inboxIntake_(m,bot); if(e&&!e.skipped) r.files++; }catch(err){ console.warn('inbox intake ('+bot.name+') failed: '+err); } }
        props.setProperty(key,String(offset)); r.offset=offset;
      }catch(err){ r.error=String(err&&err.message||err); }
      report[bot.id]=r; }
    return report;
  }catch(e){ console.warn('inboxPollBots temporary failure: '+e); return {error:String(e)}; }
  finally{ try{ if(lock) lock.releaseLock(); }catch(_){} }
}
function installInboxBotsTrigger(){ const has=ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='inboxPollBots'); if(has) return 'already installed'; ScriptApp.newTrigger('inboxPollBots').timeBased().everyMinutes(30).create(); return 'installed: inboxPollBots every 30 min ('+inboxBots_().filter(b=>!b.main).map(b=>b.name).join(', ')+')'; }
// 診斷：每支收件機器人的名稱、webhook、待處理更新數（不收檔、不改設定）
function checkInboxBots(){ const out=inboxBots_().map(b=>{ const me=tgBot_(b.token,'getMe',{}); const wh=tgBot_(b.token,'getWebhookInfo',{}); return {id:b.id,name:b.name,main:b.main,username:me.result&&me.result.username,webhook:wh.result&&wh.result.url||'',pending:wh.result&&wh.result.pending_update_count,offset:PropertiesService.getScriptProperties().getProperty(b.main?'tg_offset':'inbox_tg_offset_'+b.id)||''}; }); console.log(JSON.stringify(out,null,2)); return out; }
/* ── Telegram intake (called from handleMsg for the PROD bot, from inboxPollBots for the other bots) ── */
function inboxIntake_(msg,bot){
  bot=bot||inboxBots_()[0];
  const doc=msg.document; if(!doc) return null;
  const chatId=String(msg.chat&&msg.chat.id||''), group=String((msg.chat&&(msg.chat.title||msg.chat.username))||chatId), sender=String(msg.from&&((msg.from.first_name||'')+' '+(msg.from.last_name||'')).trim()||msg.from&&msg.from.username||'');
  const fileName=String(doc.file_name||('file_'+doc.file_unique_id)), size=Number(doc.file_size||0), when=new Date((Number(msg.date)||Date.now()/1000)*1000), date=Utilities.formatDate(when,CFG.TZ,'yyyy-MM-dd');
  const q=inboxLoad_();
  if(doc.file_unique_id && q.some(e=>e.fileUniqueId===doc.file_unique_id)) return {skipped:'duplicate'};
  const route=inboxRoute_(fileName);
  const e={id:'ib_'+Utilities.formatDate(when,CFG.TZ,'yyyyMMddHHmmss')+'_'+String(msg.message_id||''),receivedAt:Utilities.formatDate(when,CFG.TZ,"yyyy-MM-dd'T'HH:mm:ss"),group,chatId,messageId:msg.message_id,sender,fileName,size,mime:String(doc.mime_type||''),fileUniqueId:doc.file_unique_id||'',module:route.module,moduleZh:route.zh,page:route.page,status:'pending',driveId:'',note:'',source:'telegram',bot:bot.name,caption:String(msg.caption||'').slice(0,300)};
  if(size>INBOX_MAX_BYTES_){ e.status='skipped'; e.note='超過 20 MB（Bot API 上限），請用網頁手動匯入 / over 20 MB'; }
  else{
    try{
      const gf=tgBot_(bot.token,'getFile',{file_id:doc.file_id}); if(!gf.ok||!gf.result||!gf.result.file_path) throw new Error('getFile: '+(gf.description||'no file_path'));
      const res=UrlFetchApp.fetch('https://api.telegram.org/file/bot'+bot.token+'/'+gf.result.file_path,{muteHttpExceptions:true}); if(res.getResponseCode()>=300) throw new Error('download HTTP '+res.getResponseCode());
      const blob=res.getBlob().setName(fileName); const folder=inboxFolder_(group,date); const f=folder.createFile(blob); e.driveId=f.getId(); e.driveName=f.getName();
    }catch(err){ e.status='error'; e.note=String(err&&err.message||err); }
  }
  q.push(e); inboxSave_(q); inboxSheetAppend_(e);
  try{ if(e.status==='pending') tgBot_(bot.token,'setMessageReaction',{chat_id:chatId,message_id:msg.message_id,reaction:[{type:'emoji',emoji:'👍'}]}); }catch(_){}
  try{ if(PropertiesService.getScriptProperties().getProperty('INBOX_REPLY')==='1' && e.status==='pending') tgBot_(bot.token,'sendMessage',{chat_id:chatId,text:'📥 已收到 <b>'+esc_(fileName)+'</b> → '+esc_(route.zh)+'（PROD 待匯入 pending import）',parse_mode:'HTML'}); }catch(_){}
  return e;
}
/* ── Gmail intake (C.5): Outlook rule forwards to this Gmail; label PROD_Inbox (or Script Property INBOX_GMAIL_QUERY) ── */
function inboxGmailPoll(){
  const props=PropertiesService.getScriptProperties(); const query=props.getProperty('INBOX_GMAIL_QUERY')||'label:PROD_Inbox has:attachment newer_than:3d';
  const q=inboxLoad_(); const seen=new Set(q.map(e=>e.fileUniqueId)); let added=0;
  const threads=GmailApp.search(query,0,30);
  threads.forEach(t=>{ t.getMessages().forEach(m=>{ const mid=m.getId(); m.getAttachments({includeInlineImages:false}).forEach(att=>{
    const uid='gm_'+mid+'_'+att.getName(); if(seen.has(uid)) return; const fileName=att.getName(); const route=inboxRoute_(fileName); const when=m.getDate(); const date=Utilities.formatDate(when,CFG.TZ,'yyyy-MM-dd');
    const subj=m.getSubject()||''; const subjDate=(TGS&&TGS.anyDate&&(subj.match(/\d{4}-\d{2}-\d{2}/)||[])[0])||'';
    const e={id:'ib_'+Utilities.formatDate(when,CFG.TZ,'yyyyMMddHHmmss')+'_'+mid.slice(-6)+'_'+added,receivedAt:Utilities.formatDate(when,CFG.TZ,"yyyy-MM-dd'T'HH:mm:ss"),group:'Email',chatId:'',messageId:mid,sender:m.getFrom(),fileName,size:att.getSize(),mime:att.getContentType(),fileUniqueId:uid,module:route.module,moduleZh:route.zh,page:route.page,status:'pending',driveId:'',note:'',source:'gmail',subject:subj.slice(0,200),subjectDate:subjDate};
    if(att.getSize()>INBOX_MAX_BYTES_){ e.status='skipped'; e.note='over 20 MB'; } else { try{ const f=inboxFolder_('Email',date).createFile(att.copyBlob().setName(fileName)); e.driveId=f.getId(); }catch(err){ e.status='error'; e.note=String(err&&err.message||err); } }
    q.push(e); seen.add(uid); added++; inboxSheetAppend_(e); }); }); });
  if(added) inboxSave_(q); return added;
}
function installInboxGmailTrigger(){ const has=ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='inboxGmailPoll'); if(has) return 'already installed'; ScriptApp.newTrigger('inboxGmailPoll').timeBased().everyMinutes(15).create(); return 'installed: inboxGmailPoll every 15 min'; }
/* ── web actions ── */
function inboxPublic_(e){ const o=Object.assign({},e); return o; }
function handleInbox_(p){
  const a=String(p.action||'');
  if(a==='inboxList'){ const q=inboxLoad_(); const module=p.module?String(p.module):''; const status=p.status?String(p.status):'pending'; let rows=q.filter(e=>(!module||e.module===module||(module!=='unrouted'&&p.includeUnrouted&&e.module==='unrouted'))&&(status==='all'||e.status===status)); rows=rows.slice(-Number(p.limit||200)).reverse(); const counts={}; q.forEach(e=>{ if(e.status==='pending'){ counts[e.module]=(counts[e.module]||0)+1; } }); return okCors({ok:true,rows:rows.map(inboxPublic_),counts,total:q.length}); }
  if(a==='inboxFile'){ const q=inboxLoad_(); const e=q.find(x=>x.id===p.id); if(!e) return okCors({ok:false,error:'not found'}); if(!e.driveId) return okCors({ok:false,error:'no Drive file ('+(e.note||e.status)+')'}); try{ const f=DriveApp.getFileById(e.driveId); const blob=f.getBlob(); return okCors({ok:true,id:e.id,fileName:e.fileName,mime:blob.getContentType()||e.mime,size:blob.getBytes().length,base64:Utilities.base64Encode(blob.getBytes())}); }catch(err){ return okCors({ok:false,error:String(err&&err.message||err)}); } }
  if(a==='inboxDone'){ const q=inboxLoad_(); const e=q.find(x=>x.id===p.id); if(!e) return okCors({ok:false,error:'not found'}); const st=String(p.status||'done'); if(!/^(done|skipped|pending|error)$/.test(st)) return okCors({ok:false,error:'bad status'}); e.status=st; e.doneAt=st==='pending'?'':new Date().toISOString(); e.doneBy=String(p.by||'').slice(0,80); e.note=String(p.note||'').slice(0,300); if(p.module){ const r=inboxRoutes_().find(x=>x.module===p.module); e.module=String(p.module); e.page=r?r.page:''; e.moduleZh=r?r.zh:e.module; } inboxSave_(q); inboxSheetUpdate_(e); return okCors({ok:true,row:inboxPublic_(e)}); }
  if(a==='inboxRoutes') return okCors({ok:true,routes:inboxRoutes_().map(r=>({re:r.re.source,module:r.module,page:r.page,zh:r.zh,custom:!!r.custom}))});
  if(a==='inboxRetry'){ return okCors({ok:false,error:'retry: re-send the file in the group (Telegram file ids expire)'}); }
  return okCors({ok:false,error:'unknown inbox action '+a});
}
function checkInboxSetup(){ const me=tgApi_('getMe',{}); const q=inboxLoad_(); const r={bot:me.result&&me.result.username,intakeBots:inboxBots_().map(b=>b.name),queue:q.length,pending:q.filter(e=>e.status==='pending').length,byModule:{},gmailTrigger:ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='inboxGmailPoll'),botsTrigger:ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='inboxPollBots'),note:'群組裡要把機器人設為管理員或關閉 privacy mode（BotFather /setprivacy Disable），否則收不到檔案訊息。'}; q.forEach(e=>{ r.byModule[e.module]=(r.byModule[e.module]||0)+1; }); console.log(JSON.stringify(r,null,2)); return r; }
