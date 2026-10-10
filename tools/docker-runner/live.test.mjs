import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialize, executeCase, docker } from './core.mjs';
const enabled = process.env.DISHA_DOCKER_LIVE_TESTS === 'true';
const options = { skip: !enabled, concurrency: false };
let image; const run = async (language, source, stdin='') => executeCase(image ||= await initialize(),language,source,stdin,new AbortController().signal);
const programs = {
 python:'print("Hello Disha360")',
 javascript:'console.log("Hello Disha360")',
 java:'public class Main { public static void main(String[] args) { System.out.println("Hello Disha360"); } }',
 cpp:'#include <iostream>\nint main(){std::cout<<"Hello Disha360";return 0;}',
};
for (const [language,source] of Object.entries(programs)) test(`REAL ${language} hello`,options,async()=>{const r=await run(language,source);assert.equal(r.verdict,'Accepted');assert.equal(r.stdout.trim(),'Hello Disha360');assert.equal(r.exitCode,0);assert.ok(r.timeSeconds>=0);});
const inputs = {
 python:'print(int(input())+int(input()))',
 javascript:'const fs=require("fs");console.log(fs.readFileSync(0,"utf8").trim().split(/\\s+/).map(Number).reduce((a,b)=>a+b,0));',
 java:'import java.util.Scanner; public class Main {public static void main(String[] a){Scanner s=new Scanner(System.in);System.out.println(s.nextInt()+s.nextInt());}}',
 cpp:'#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;}',
};
for (const [language,source] of Object.entries(inputs)) test(`REAL ${language} stdin`,options,async()=>{const r=await run(language,source,'20\n22\n');assert.equal(r.verdict,'Accepted');assert.equal(r.stdout.trim(),'42');});
test('REAL distinct stdout/stderr and empty output',options,async()=>{const r=await run('python','import sys\nprint("out")\nprint("err",file=sys.stderr)');assert.equal(r.stdout,'out\n');assert.equal(r.stderr,'err\n');assert.equal((await run('python','pass')).stdout,'');});
test('REAL compilation failures in Java and C++',options,async()=>{for(const lang of ['java','cpp']){const r=await run(lang,'invalid program');assert.equal(r.verdict,'Compilation Error');assert.ok(r.compileOutput.length>0);}});
test('REAL runtime failure',options,async()=>{const r=await run('python','raise ValueError("test failure")');assert.equal(r.verdict,'Runtime Error');assert.notEqual(r.exitCode,0);assert.match(r.stderr,/ValueError/);});
test('REAL infinite loop is killed',options,async()=>{const start=Date.now();const r=await run('python','while True: pass');assert.equal(r.verdict,'Time Limit Exceeded');assert.ok(Date.now()-start<15000);});
test('REAL memory exhaustion stays inside its cgroup',options,async()=>{const r=await run('python','x=bytearray(800*1024*1024)');assert.equal(r.verdict,'Memory Limit Exceeded');});
test('REAL output flood is bounded and terminated',options,async()=>{const r=await run('python','while True: print("x"*1000,flush=True)');assert.equal(r.outputTruncated,true);assert.ok(Buffer.byteLength(r.stdout)+Buffer.byteLength(r.stderr)<=16384);assert.notEqual(r.verdict,'Accepted');});
test('REAL root filesystem, network and application secrets are inaccessible',options,async()=>{
 const r=await run('python','import socket,os\nassert "MONGODB_URI" not in os.environ\nassert "DOCKER_RUNNER_TOKEN" not in os.environ\ntry:\n open("/secret-test", "w").write("x")\n raise Exception("root was writable")\nexcept OSError: pass\ns=socket.socket();s.settimeout(1)\ntry:\n s.connect(("1.1.1.1",80))\n raise Exception("network accessible")\nexcept OSError: pass\nassert not os.path.exists("/var/run/docker.sock")\nprint("isolated")');
 assert.equal(r.verdict,'Accepted');assert.equal(r.stdout.trim(),'isolated');
});
test('REAL Java public class filename and malicious child cleanup',options,async()=>{
 assert.equal((await run('java','public class Practice { public static void main(String[] a){System.out.println("class-name");}}')).stdout.trim(),'class-name');
 const r=await run('python','import subprocess\nsubprocess.Popen(["python3","-c","import time; time.sleep(120)"],start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)\nprint("spawned")');assert.equal(r.verdict,'Accepted');
 const listed=await docker(['ps','-aq','--filter','label=disha360.runner=true']);assert.equal(listed.stdout.trim(),'');
});
test('REAL process and temporary filesystem limits',options,async()=>{
 const pid=await run('python','import subprocess\nfor i in range(100):\n try:\n  subprocess.Popen(["sleep","20"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)\n except OSError:\n  print("pid-limited");break\nelse:\n raise Exception("PID limit missing")');assert.equal(pid.stdout.trim(),'pid-limited');
 const disk=await run('python','try:\n with open("/workspace/flood","wb") as f:\n  for i in range(40): f.write(b"x"*(1024*1024))\n raise Exception("workspace limit missing")\nexcept OSError: print("workspace-limited")');assert.equal(disk.stdout.trim(),'workspace-limited');
 const listed=await docker(['ps','-aq','--filter','label=disha360.runner=true']);assert.equal(listed.stdout.trim(),'');
});
