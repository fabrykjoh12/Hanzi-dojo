import { chromium } from '/workspace/scratch/bb2a1954cdbf/hanzi-dojo-recovery/node_modules/playwright/index.mjs';
import { mockSupabaseRoutes } from '/workspace/scratch/bb2a1954cdbf/hanzi-dojo-recovery/tests/fixtures/mockSupabase.js';
import { spawn } from 'node:child_process';
const root='/workspace/scratch/bb2a1954cdbf/hanzi-dojo-recovery';
const server=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--mode','e2e','--host','127.0.0.1','--port','5193','--strictPort'],{cwd:root,env:{...process.env,DOJO_PUBLIC_BUILD:'1',DOJO_NATIVE_BUILD:'1'},stdio:'ignore'});
let browser;
try {
for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:5193');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
browser=await chromium.launch({executablePath:'/tmp/hanzi-chromium/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--disable-gpu'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/hanzi-chromium/lib',FONTCONFIG_FILE:'/tmp/hanzi-system-fonts/fonts.conf'}});
const page=await browser.newPage();await mockSupabaseRoutes(page);await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//,r=>r.abort());await page.goto('http://127.0.0.1:5193');
const result=await page.evaluate(async()=>{
const storage=await import('/src/offline.js');const journal=await import('/src/reviewJournal.js');const snapshots=[];
const record=async(name,result)=>snapshots.push({name,result,records:await storage.reviewRecords('conflict-owner')});
const track={language:'chinese',system:'hsk_3'};
const first={...track,level:1,opId:'conflict-first',userId:'conflict-owner',vocabId:'v1',cardId:'c1',expected:{revision:1}};
const base=await storage.reviewCreate(first);await storage.reviewUpdate(base.opId,base.userId,{status:'applied',card:{id:'c1',vocab_id:'v1',revision:2}},base);await record('applied');
const stale={...first,opId:'conflict-second',expected:{id:'c1',revision:2}};
const conflict=await journal.submitReview({rpc:async()=>({error:{code:'40001'}})},stale);await record('conflict',conflict);
const client={rpc(){throw new Error('Offline')}};
const blocked=await journal.submitReview(client,{...stale,opId:'conflict-third'},{online:false});await record('blocked',blocked);
const baseline=await journal.reviewBaseline(first.userId);snapshots.push({name:'baseline',baseline});
const reconciled=await journal.reconcileReviewCards(first.userId,[{id:'c1',vocab_id:'v1',revision:3}],track,{}, {fresh:true,baseline,complete:true});await record('reconciled',reconciled);
const repaired=await journal.reconcileReviewCards(first.userId,[{id:'c1',vocab_id:'v1',revision:1}],track);await record('repaired',repaired);
const stillStale=await journal.submitReview(client,{...stale,opId:'conflict-fourth'},{online:false});await record('still-stale',stillStale);
const fresh=await journal.submitReview(client,{...stale,opId:'conflict-fifth',expected:{id:'c1',revision:3}},{online:false});await record('fresh',fresh);
return snapshots;
});console.log(JSON.stringify(result,null,2));
}finally{await browser?.close();server.kill('SIGTERM')}
