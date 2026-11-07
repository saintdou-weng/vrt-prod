/* VRT Machine Register v1.0.0 (2026-11-07)
   機台清冊：每台實體機一個資產編號（Asset No.／Machine ID），用來回答「工廠有幾台、壞幾台、在哪條線」。
   - parseWorkbook(wb, fileName)：讀「VRT Simple Machine ID Register」這類 Excel（表頭有 Asset No. ＋ Machine Type）。
   - familyOf(type)：把清冊的機種文字對到 IE OBD 的機台家族（SN、5 線拷克、打棗…），IE 排線頁用同一套家族比對需求 vs 現有。
   - summary(machines)：依家族／機種／位置／狀況統計。
   純函式，不碰 DOM、不存檔；存檔由零件備品頁（vrt-maintenance-v39.js → maintenance39.machines）負責，IE 頁唯讀。 */
(function(g){'use strict';
  if(g.VRTMachineRegister)return;
  const VERSION='1.0.0';
  const norm=s=>String(s==null?'':s).replace(/[​﻿]/g,'').replace(/\s+/g,' ').trim();
  const up=s=>norm(s).toUpperCase();
  const hash=s=>{let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)};

  /* 清冊機種 → IE 機台家族。sewing:false = 裁剪／檢驗／公用設備，不算車縫機台。 */
  const RULES=[
    [/SINGLE\s*NEEDLE|平車|LOCKSTITCH/i,'SN',true],
    [/FLATBED.*CHAIN|DOUBLE\s*NEEDLE\s*CHAIN|链式|鏈式|CHAINSTITCH|COVER\s*STITCH|FLAT\s*LOCK/i,'Chainstitch',true],
    [/DOUBLE\s*NEEDLE|双针|雙針|TWIN\s*NEEDLE/i,'Double Needle',true],
    [/OVERLOCK|拷克|SERGER/i,null,true],            // 線數看文字：5针／4针／3针
    [/BAR\s*TACK|打棗|打枣/i,'Bartack',true],
    [/BUTTON\s*HOLE|開扣眼|开扣眼|EYELET/i,'Buttonhole',true],
    [/BUTTON\s*ATTACH|釘扣|钉扣/i,'Button Attach',true],
    [/SNAP|按扣|快照|PRESS\s*STUD|RIVET/i,'Snap',true],
    [/WAIST\s*BAND|腰带|腰帶/i,'Waistband',true],
    [/CUTTING|裁剪|SPREADER|拉布|MILLING|铣|銑/i,'Cutting',false],
    [/NEEDLE\s*DETECT|驗針|验针|TEST|试验|試驗|COMPRESSOR|空壓|空压/i,'Utility',false],
    [/\bIRON|\bPRESSING\b|\bSTEAM|燙|烫/i,'Iron',true],
    [/PATTERN\s*SEW|花样|花樣|POCKET|BLIND\s*STITCH|盲缝|盲縫/i,'Special / Other',true]
  ];
  const FAMILY_ZH={'SN':'單針平車','3-thread Overlock':'三線拷克','4-thread Overlock':'四線拷克','5-thread Overlock':'五線拷克','Double Needle':'雙針','Chainstitch':'鏈縫（雙針鏈縫）','Bartack':'打棗','Buttonhole':'開釦眼','Button Attach':'釘釦','Snap':'打四合釦','Waistband':'腰頭機','Iron':'整燙','Manual':'手工','Special / Other':'特種／其他','Cutting':'裁剪設備','Utility':'檢驗／公用'};
  function familyOf(type){const t=norm(type);if(!t)return {family:'Special / Other',sewing:true};
    for(const [re,fam,sewing] of RULES){if(!re.test(t))continue;if(fam)return {family:fam,sewing};
      const m=t.match(/([345])\s*(?:针|針|THREAD|T\b|線|线)/i)||t.match(/\b([345])\s*-?\s*(?:OVL|OL)\b/i);return {family:(m?m[1]:'5')+'-thread Overlock',sewing}}
    return {family:'Special / Other',sewing:true}}
  /* 「Good 正常」「Damaged 損壞」「空白」→ good / damaged / unknown */
  function conditionOf(v){const t=up(v);if(!t)return 'unknown';if(/DAMAG|BROKEN|BAD|REPAIR|損|损|壞|坏|維修|维修/.test(t))return 'damaged';if(/IDLE|STANDBY|閒置|闲置|SPARE/.test(t))return 'idle';if(/GOOD|OK|NORMAL|正常|好/.test(t))return 'good';return 'unknown'}
  /* 「B SHOP B店」→ B SHOP；「Line 5」「L5」→ Line 5（車縫線）。 */
  function placeOf(v){const t=norm(v);if(!t)return {place:'',line:''};const lm=t.match(/^(?:LINE|L)\s*-?\s*(\d{1,2})\b/i)||t.match(/\bLINE\s*-?\s*(\d{1,2})\b/i);if(lm)return {place:t,line:'Line '+Number(lm[1])};const sm=t.match(/\b([A-Z])\s*SHOP\b/i);return {place:sm?sm[1].toUpperCase()+' SHOP':t,line:''}}
  const HEAD={assetNo:/^ASSET\s*NO|資產編號|资产编号/i,machineId:/^MACHINE\s*ID|機台編號|机台编号/i,type:/^MACHINE\s*TYPE|機種|机种|機台類型/i,brand:/^BRAND|品牌/i,model:/^MODEL|型號|型号/i,serial:/^SERIAL|序號|序号/i,year:/^YEAR|年份/i,location:/^LOCATION|PLACE|位置|地點/i,line:/^LINE\b|線別|线别/i,condition:/^CONDITION|狀況|状况/i,remark:/^REMARK|備註|备注/i};
  function findHeader(aoa){for(let r=0;r<Math.min(aoa.length,30);r++){const row=aoa[r]||[],cols={};row.forEach((c,i)=>{const t=norm(c);if(!t)return;for(const [k,re] of Object.entries(HEAD))if(cols[k]==null&&re.test(t))cols[k]=i});if(cols.assetNo!=null&&cols.type!=null)return {row:r,cols}}return null}
  function isRegisterWorkbook(wb){try{return (wb.SheetNames||[]).some(n=>{const ws=wb.Sheets[n];if(!ws||!g.XLSX)return false;return !!findHeader(g.XLSX.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:false}).slice(0,30))})}catch(_){return false}}
  /* 回傳 {machines:[…], sheet, skipped, duplicates}；同一個資產編號只留一筆（後面的覆蓋前面的，數量記在 duplicates）。 */
  function parseWorkbook(wb,fileName){const X=g.XLSX;for(const name of wb.SheetNames||[]){const aoa=X.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',blankrows:true,raw:true});const h=findHeader(aoa);if(!h)continue;
      const by=new Map();let skipped=0,duplicates=0;const now=new Date().toISOString();
      for(let r=h.row+1;r<aoa.length;r++){const row=aoa[r]||[],cell=k=>h.cols[k]==null?'':norm(row[h.cols[k]]);const assetNo=cell('assetNo').toUpperCase(),type=cell('type');if(!assetNo||!type){if(assetNo||type)skipped++;continue}
        const fam=familyOf(type),loc=placeOf(cell('location')),lineCol=cell('line'),line=lineCol?placeOf(/^\d+$/.test(lineCol)?'Line '+lineCol:lineCol).line:loc.line,yr=cell('year');
        const rec={id:'MCH-'+assetNo,assetNo,machineId:cell('machineId').toUpperCase(),type,typeEn:type.replace(/\s*[\u3400-\u9fff][\s\S]*$/,'').trim()||type,family:fam.family,sewing:fam.sewing,brand:cell('brand'),model:cell('model'),serial:cell('serial'),year:yr,location:loc.place,line,condition:conditionOf(cell('condition')),conditionText:cell('condition'),remark:cell('remark'),sourceFile:fileName||'',sourceSheet:name,sourceRow:r+1,createdAt:now,updatedAt:now};
        rec.fingerprint=hash([rec.assetNo,rec.machineId,rec.type,rec.brand,rec.model,rec.serial,rec.year,rec.location,rec.line,rec.condition,rec.remark].join('|'));
        if(by.has(assetNo))duplicates++;by.set(assetNo,rec)}
      return {machines:[...by.values()],sheet:name,skipped,duplicates,headerRow:h.row+1}}
    return null}
  /* 匯入合併：新資產加入；同資產內容有變才更新（保留手動填的線別／狀況，除非新檔有填）；清冊沒列到的舊資產不刪。 */
  function merge(existing,incoming){const map=new Map((existing||[]).map(m=>[m.assetNo,m]));let added=0,updated=0,same=0;const now=new Date().toISOString();
    for(const m of incoming||[]){const old=map.get(m.assetNo);if(!old){map.set(m.assetNo,m);added++;continue}if(old.fingerprint===m.fingerprint){same++;continue}
      const next={...old,...m,id:old.id,createdAt:old.createdAt||m.createdAt,updatedAt:now};if(!m.line&&old.line)next.line=old.line;if(m.condition==='unknown'&&old.condition&&old.condition!=='unknown'){next.condition=old.condition;next.conditionText=old.conditionText}
      next.fingerprint=hash([next.assetNo,next.machineId,next.type,next.brand,next.model,next.serial,next.year,next.location,next.line,next.condition,next.remark].join('|'));map.set(m.assetNo,next);updated++}
    return {machines:[...map.values()].sort((a,b)=>String(a.assetNo).localeCompare(String(b.assetNo),undefined,{numeric:true})),added,updated,same}}
  /* 能用＝沒標損壞（good＋unknown＋idle）。unknown 另外列，讓人知道還沒盤點。 */
  function usable(m){return m&&!m.deleted&&m.condition!=='damaged'}
  function summary(list){const ms=(list||[]).filter(m=>m&&!m.deleted),fam={},type={},loc={},line={},cond={good:0,damaged:0,idle:0,unknown:0};
    for(const m of ms){cond[m.condition]=(cond[m.condition]||0)+1;const f=fam[m.family]||(fam[m.family]={family:m.family,sewing:m.sewing!==false,total:0,usable:0,damaged:0,unknown:0,byLine:{}});f.total++;if(usable(m))f.usable++;if(m.condition==='damaged')f.damaged++;if(m.condition==='unknown')f.unknown++;if(m.line){f.byLine[m.line]=(f.byLine[m.line]||0)+(usable(m)?1:0)}
      type[m.type]=(type[m.type]||0)+1;const lk=m.location||'—';loc[lk]=(loc[lk]||0)+1;if(m.line)line[m.line]=(line[m.line]||0)+1}
    return {total:ms.length,sewing:ms.filter(m=>m.sewing!==false).length,usable:ms.filter(usable).length,cond,families:Object.values(fam).sort((a,b)=>b.total-a.total),types:Object.entries(type).sort((a,b)=>b[1]-a[1]),locations:Object.entries(loc).sort((a,b)=>b[1]-a[1]),lines:Object.entries(line).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})),withLine:ms.filter(m=>m.line).length}}
  /* IE 用：某家族「工廠可用台數」與「某線可用台數」。拷克 3／4／5 線另外合計，因為 5 線機常兼做 3 線。 */
  function availability(list,family,line){const ms=(list||[]).filter(usable);const isOvl=f=>/Overlock$/.test(f);const same=ms.filter(m=>m.family===family),ovl=isOvl(family)?ms.filter(m=>isOvl(m.family)):[];
    return {factory:same.length,factoryOverlockAll:isOvl(family)?ovl.length:null,line:line?same.filter(m=>m.line===line).length:null,lineKnown:ms.some(m=>m.line),damaged:(list||[]).filter(m=>!m.deleted&&m.family===family&&m.condition==='damaged').length}}
  g.VRTMachineRegister={version:VERSION,familyOf,conditionOf,placeOf,findHeader,isRegisterWorkbook,parseWorkbook,merge,summary,availability,usable,FAMILY_ZH};
})(typeof window!=='undefined'?window:globalThis);
