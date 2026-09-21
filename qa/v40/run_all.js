#!/usr/bin/env node
const fs=require('fs'),path=require('path'),cp=require('child_process');
const suites=[['../v39/run_all.js','../v39/RESULTS_v3.9.json'],['run_attachment_checks.js','attachment_results.json'],['sync_recovery_checks.js','sync_recovery_results.json'],['crud_checks.js','crud_results.json'],['final_safety_checks.js','final_safety_results.json']];
let failed=false;const tests=[];
for(const [script,resultFile] of suites){
  const resultPath=path.join(__dirname,resultFile);if(fs.existsSync(resultPath))fs.unlinkSync(resultPath);
  const run=cp.spawnSync(process.execPath,[path.join(__dirname,script)],{encoding:'utf8',timeout:180000,maxBuffer:20*1024*1024});
  process.stdout.write(run.stdout||'');process.stderr.write(run.stderr||'');
  if(run.status!==0){failed=true;if(run.error)console.error(run.error.message)}
  if(fs.existsSync(resultPath)){const result=JSON.parse(fs.readFileSync(resultPath,'utf8'));tests.push(...(Array.isArray(result)?result:result.tests).map(t=>({...t,runner:script})))}
  else{failed=true;tests.push({name:script,status:'FAIL',detail:'No new result file generated'})}
}
const result={release:'VRT PROD 4.0.0',generatedAt:new Date().toISOString(),environment:'Node; simulated DOM and IndexedDB; mock cloud. Actual uploaded Excel files plus generated EML wrappers. No live GAS, mobile or desktop browser certification.',pass:tests.filter(t=>t.status==='PASS').length,fail:tests.filter(t=>t.status==='FAIL').length,runnerFailed:failed,tests};
fs.writeFileSync(path.join(__dirname,'RESULTS_v4.0.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({release:result.release,pass:result.pass,fail:result.fail,runnerFailed:failed}));if(failed||result.fail)process.exitCode=1;
