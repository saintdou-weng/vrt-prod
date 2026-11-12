/* ── v4.27 (2026-11-12) 群組問答（Paul 11/12：「就我，可回也可重算」）
   用法：訊息開頭打 ？（或直接回覆 bot 的報告）→ bot 用最新日報數字＋排單表回答；要求重算／重發時 bot 會重算那份報告再發一次。
   只有配對過的那一個人能問：在編輯器跑 qaPairCode() 拿 6 位數配對碼 → 本人對 bot 傳「/qa 配對碼」→ 記住他的 Telegram id（QA_OWNER_ID）。
   每天最多 40 題（QA_N_日期）。每題用到 Claude API（費用記在 claudeUsageLog_，purpose=groupqa）。不含任何金鑰。 */
function qaPairCode(){ var c=String(Math.floor(100000+Math.random()*900000)); rsProps_().setProperty('QA_PAIR',c); console.log('配對碼：'+c); return c; }
function qaContext_(){
  var today=todayYmd_(), data=dailyReportData_('',today,'day');
  var f=DR.compute(data,{date:data.date,today:today,period:'day',kind:'day'});
  var from=DR.helpers.addDays(today,-7);
  var plan=(data.prodplan||[]).filter(function(r){ return r&&String(r.endDate||r.startDate||'')>=from; }).slice(0,220).map(function(r){ return [String(r.line||'').replace('Line ','L'),r.customer,r.style,r.po,r.sewingQty,String(r.startDate||'').slice(5),String(r.endDate||'').slice(5),r.dailyOutput].join('|'); }).join('\n');
  return { today:today, date:data.date, facts:JSON.stringify(f).slice(0,22000), plan:plan };
}
function qaHandle_(msg){
  var t=String(msg&&msg.text||'').trim(); if(!t)return false;
  var p=rsProps_(), uid=String(msg.from&&msg.from.id||''), chatId=String(msg.chat.id);
  var first=t.split(/\s+/)[0].split('@')[0].toLowerCase();
  if(first==='/qa'){ var code=t.split(/\s+/)[1]||'', want=p.getProperty('QA_PAIR');
    if(want&&code===want){ p.setProperty('QA_OWNER_ID',uid); p.deleteProperty('QA_PAIR'); tgSendHtml_(chatId,'✅ 設定好了：之後只有你可以問我。\n用法：訊息開頭打 ？ 再接問題，或直接回覆我發的報告。\n例：？L3 為什麼沒單　／　？重算今天日報'); }
    else tgSendHtml_(chatId,'配對碼不對或已經用過。');
    return true; }
  if(t.charAt(0)==='/')return false;
  var rep=msg.reply_to_message, isReply=!!(rep&&rep.from&&rep.from.is_bot);
  if(!(/^[?？]/.test(t)||isReply))return false;
  var owner=p.getProperty('QA_OWNER_ID'); if(!owner||owner!==uid)return false;
  var today=todayYmd_(), nk='QA_N_'+today, n=Number(p.getProperty(nk)||0);
  if(n>=40){ tgSendHtml_(chatId,'今天已經問滿 40 題，明天再問。'); return true; }
  p.setProperty(nk,String(n+1));
  var q=t.replace(/^[?？]\s*/,'');
  try{ tgApi_('sendChatAction',{chat_id:chatId,action:'typing'}); }catch(_){}
  try{
    var ctx=qaContext_();
    var sys='你是 VRT（柬埔寨成衣廠）生產平台的助理，在 Telegram 群組回答廠協理 Paul 的問題。只能根據下面給的資料回答：數字要精準，資料裡沒有的就直接說「平台裡沒有這筆資料」，不要猜。用繁體中文、口語、精簡，最多 8 行，不要用 Markdown 符號。如果他要求重算或重發報告，在回答的最後另起一行、只寫 ACTION:day（日報）或 ACTION:eff（效率週報）或 ACTION:plan（排單週報）；沒有要求就不要寫 ACTION。';
    var user='今天 '+ctx.today+'，最新車縫資料日 '+ctx.date+'\n\n【他回覆的那則訊息】\n'+(isReply?String(rep.text||rep.caption||'').slice(0,3000):'（沒有）')+'\n\n【最新日報的數字（JSON）】\n'+ctx.facts+'\n\n【排單表：組|客戶|款|PO|件數|開始|結束|日產（今天往前 7 天起）】\n'+(ctx.plan||'（沒有）')+'\n\n【問題】\n'+q;
    var r=claudeMessage_(sys,user,900,'groupqa'); var ans=String(r&&r.text||'').trim();
    var m=ans.match(/ACTION:(day|eff|plan)/); ans=ans.replace(/\n?ACTION:(day|eff|plan)\s*/g,'').trim();
    tgSendHtml_(chatId,'🤖 '+esc_(ans||'（沒有回答）'));
    if(m){ var kind=m[1], lastWeek=DR.helpers.addDays(today,-7);
      if(kind==='day')generateDailyReport('',{period:'day',kind:'day',force:true,send:true});
      else generateDailyReport(lastWeek,{period:'week',kind:kind,force:true,send:true}); }
  }catch(e){ tgSendHtml_(chatId,'⚠️ 這題答不出來：'+esc_(String(e&&e.message||e).slice(0,200))); }
  return true;
}
