#!/usr/bin/env node
const fs=require('fs'),path=require('path'),cp=require('child_process');
const suites=["qa_logic.js", "qa_ie_runtime.js", "qa_maintenance_runtime.js", "qa_bom_runtime.js", "qa_sync.js", "qa_smv_runtime.js", "qa_import_roundtrip.js"];
let failed=false;
for(const suite of suites){const r=cp.spawnSync(process.execPath,[path.join(__dirname,suite)],{encoding:'utf8'});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)failed=true}
const tests=[];for(const f of fs.readdirSync(path.join(__dirname,'results')).filter(n=>n.endsWith('_results.json')))tests.push(...JSON.parse(fs.readFileSync(path.join(__dirname,'results',f),'utf8')).map(x=>({...x,suite:f})));
const result={release:'VRT PROD 3.9.0',generatedAt:new Date().toISOString(),environment:'Node runtime with simulated DOM and IndexedDB; Smart Sync mock server; no live browser or GAS calls',pass:tests.filter(t=>t.status==='PASS').length,fail:tests.filter(t=>t.status==='FAIL').length,tests};
fs.writeFileSync(path.join(__dirname,'RESULTS_v3.9.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({pass:result.pass,fail:result.fail}));if(failed||result.fail)process.exitCode=1;
