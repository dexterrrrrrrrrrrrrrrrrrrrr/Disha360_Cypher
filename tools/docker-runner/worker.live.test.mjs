import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { docker } from './core.mjs';
const options={skip:process.env.DISHA_DOCKER_LIVE_TESTS!=='true'};
const url='http://127.0.0.1:4010';
const headers=()=>({'Content-Type':'application/json',Authorization:`Bearer ${readFileSync(new URL('../../.disha-local/runner-token',import.meta.url),'utf8').trim()}`});
test('REAL worker rejects unauthorized, browser-origin, malformed and oversized requests',options,async()=>{
 assert.equal((await fetch(`${url}/health`)).status,401);
 assert.equal((await fetch(`${url}/health`,{headers:{...headers(),Origin:'http://localhost:5173'}})).status,401);
 for(const body of ['{',JSON.stringify({language:'bash',source:'echo unsafe'}),JSON.stringify({language:'python',source:'print(1)',command:'sh'})]) assert.equal((await fetch(`${url}/execute`,{method:'POST',headers:headers(),body})).status,400);
 assert.equal((await fetch(`${url}/execute`,{method:'POST',headers:headers(),body:'x'.repeat(250001)})).status,413);
 assert.equal((await fetch(`${url}/health`,{headers:headers()})).status,200);
});
test('REAL disconnected execution is removed and never reported as success',options,async()=>{
 const controller=new AbortController();
 const first=fetch(`${url}/execute`,{method:'POST',headers:headers(),body:JSON.stringify({language:'python',source:'import time;time.sleep(30)',stdin:''}),signal:controller.signal}).catch(()=>null);
 await new Promise(r=>setTimeout(r,4500));controller.abort();assert.equal(await first,null);
 let empty=false;
 for(let i=0;i<30;i++){const listed=await docker(['ps','-aq','--filter','label=disha360.runner=true']);if(listed.code===0&&!listed.stdout.trim()){empty=true;break;}await new Promise(r=>setTimeout(r,500));}
 assert.equal(empty,true);assert.equal((await fetch(`${url}/health`,{headers:headers()})).status,200);
});
