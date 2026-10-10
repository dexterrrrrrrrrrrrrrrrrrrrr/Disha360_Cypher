import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { testDatabase, studentAccount, studentCall } from './helpers/student.js';
import { createApp } from '../src/app.js';
import { DockerExecutionProvider } from '../src/services/dockerExecution.js';
import { seedCoding } from '../src/services/sampleCoding.js';
import { CodingProblem } from '../src/models/CodingProblem.js';
import { CodingSubmission } from '../src/models/CodingSubmission.js';
const programs={python:'import sys\nprint(sum(map(int,sys.stdin.read().split())))',javascript:'console.log(require("fs").readFileSync(0,"utf8").trim().split(/\\s+/).map(Number).reduce((a,b)=>a+b,0))',java:'import java.util.Scanner;public class Main{public static void main(String[] a){Scanner s=new Scanner(System.in);long sum=0;while(s.hasNextLong())sum+=s.nextLong();System.out.println(sum);}}',cpp:'#include <iostream>\nint main(){long long a,s=0;while(std::cin>>a)s+=a;std::cout<<s;}'};
describe.skipIf(process.env.DISHA_DOCKER_LIVE_TESTS!=='true')('REAL Docker worker through authenticated Disha360 routes',()=>{
 let db:Awaited<ReturnType<typeof testDatabase>>;
 beforeAll(async()=>{db=await testDatabase(); const provider=new DockerExecutionProvider(); let available=false; for(let i=0;i<20;i++){if((await provider.availability()).available){available=true;break;}await new Promise(r=>setTimeout(r,500));}expect(available).toBe(true);},180000);beforeEach(async()=>db.clear());afterAll(async()=>db?.close());
 function app(){return createApp({clientOrigin:'http://localhost:5173',databaseConfigured:true,allowDemoAccounts:true,executionProvider:new DockerExecutionProvider()});}
 it.each(['python','java','cpp','javascript'] as const)('runs and grades real %s against hidden tests without leaking them',async language=>{
  const application=app(),s=await studentAccount(),other=await studentAccount();await seedCoding('development');const p=(await CodingProblem.findOne({difficulty:'easy'}).select('+hiddenTests'))!;
  const run=await studentCall(application,s.cookie,'post','/coding/run',{language,source:programs[language],stdin:'20 22'});expect(run.status).toBe(200);expect(run.body.data.execution.stdout.trim()).toBe('42');expect(run.body.data.execution.exitCode).toBe(0);
  const body={language,source:programs[language],requestId:randomUUID()},path=`/coding/problems/${p.id}/submissions`;
  const submitted=await studentCall(application,s.cookie,'post',path,body);expect(submitted.status).toBe(201);const result=submitted.body.data.submission;expect(result).toMatchObject({verdict:'Accepted',passed:3,total:3,score:100});
  expect(JSON.stringify(submitted.body)).not.toMatch(/expected|stdout|hiddenTests|999999/);expect(await CodingSubmission.countDocuments()).toBe(1);
  expect((await studentCall(application,s.cookie,'post',path,body)).body.data.submission.id).toBe(result.id);
  expect((await studentCall(application,other.cookie,'get',`/coding/submissions/${result.id}`)).status).toBe(404);
  const history=await studentCall(application,s.cookie,'get','/coding/submissions');expect(history.body.data.submissions).toHaveLength(1);
 },80000);
 it('rejects unauthenticated requests and grades wrong answers genuinely',async()=>{
  const application=app(),s=await studentAccount();await seedCoding('development');const p=(await CodingProblem.findOne({difficulty:'easy'}))!;
  expect((await request(application).post('/api/v1/student/coding/run').set('Origin','http://localhost:5173').set('X-Disha360-Request','1').send({language:'python',source:'print(0)'})).status).toBe(401);
  const r=await studentCall(application,s.cookie,'post',`/coding/problems/${p.id}/submissions`,{language:'python',source:'print(0)',requestId:randomUUID()});expect(r.body.data.submission.verdict).toBe('Wrong Answer');expect(r.body.data.submission.passed).toBe(1);
 },60000);
 it('bounds concurrent real requests without duplicate containers or fabricated success',async()=>{
  const provider=new DockerExecutionProvider();const first=provider.execute({language:'python',source:'import time;time.sleep(2);print("done")',stdin:''});await new Promise(r=>setTimeout(r,200));
  await expect(provider.execute({language:'python',source:'print(1)',stdin:''})).rejects.toMatchObject({code:'EXECUTION_LIMITED'});expect((await first).stdout.trim()).toBe('done');
 },30000);
});
describe.skipIf(process.env.DISHA_DOCKER_LIVE_TESTS!=='true')('REAL concurrent submissions',()=>{
 let db:Awaited<ReturnType<typeof testDatabase>>;
 beforeAll(async()=>{db=await testDatabase();},180000);afterAll(async()=>db?.close());
 it('persists genuine grading for one student and an unscored busy result for another',async()=>{
  await db.clear();await seedCoding('development');const p=(await CodingProblem.findOne({difficulty:'easy'}))!,s=await studentAccount(),other=await studentAccount();
  const app=createApp({clientOrigin:'http://localhost:5173',databaseConfigured:true,allowDemoAccounts:true,executionProvider:new DockerExecutionProvider()});
  const path=`/coding/problems/${p.id}/submissions`,body={language:'python',source:programs.python};
  const first=studentCall(app,s.cookie,'post',path,{...body,requestId:randomUUID()}).then(r=>r);await new Promise(r=>setTimeout(r,500));
  const second=await studentCall(app,other.cookie,'post',path,{...body,requestId:randomUUID()});expect(second.body.data.submission).toMatchObject({verdict:'System Error',score:null});
  expect((await first).body.data.submission.verdict).toBe('Accepted');expect(await CodingSubmission.countDocuments()).toBe(2);
 },60000);
});
