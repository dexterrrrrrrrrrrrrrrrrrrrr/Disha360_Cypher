import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DockerExecutionProvider, dockerLimits } from '../src/services/dockerExecution.js';
import { configureExecution } from '../src/services/executionProvider.js';
import { envSchema } from '../src/config/env.js';
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
function tokenFile() { const d = mkdtempSync(join(tmpdir(),'disha-worker-test-')); dirs.push(d); const file=join(d,'token');writeFileSync(file,'a'.repeat(64),{mode:0o600});return file; }
const result={ verdict:'Accepted',stdout:'42\n',stderr:'',compileOutput:'',timeSeconds:0.1,memoryKb:null,exitCode:0,outputTruncated:false };
it('selects Docker without any cloud key, preserves opt-in providers and rejects production activation',()=>{
 const settings=envSchema.parse({CODING_EXECUTION_PROVIDER:'docker',DOCKER_RUNNER_TOKEN_FILE:tokenFile()});
 expect(configureExecution(settings).provider?.name).toBe('Local Docker sandbox');expect(settings.ONECOMPILER_API_KEY).toBeUndefined();expect(settings.JUDGE0_SECURITY_CONFIRMED).toBe(false);
 expect(envSchema.safeParse({NODE_ENV:'production',CODING_EXECUTION_PROVIDER:'docker',MONGODB_URI:'mongodb://localhost/test',CLIENT_ORIGIN:'https://frontend.test'}).success).toBe(false);
 expect(configureExecution({...settings,NODE_ENV:'production'}).provider).toBeUndefined();
 expect(configureExecution({...settings,CODING_EXECUTION_PROVIDER:'disabled'}).provider).toBeUndefined();
});
it('requires a private token and loopback endpoint without exposing its contents',()=>{
 const path=tokenFile();expect(()=>new DockerExecutionProvider('https://example.test',path)).toThrow();
 writeFileSync(path,'invalid');expect(()=>new DockerExecutionProvider('http://127.0.0.1:4010',path)).toThrow();
 expect(configureExecution({...envSchema.parse({}),CODING_EXECUTION_PROVIDER:'docker',DOCKER_RUNNER_TOKEN_FILE:'/nonexistent/token'}).message).toContain('runner:dev');
});
it('validates bounded worker responses and matching test counts',async()=>{
 const transport=vi.fn().mockResolvedValue(Response.json({results:[result]}));const p=new DockerExecutionProvider(undefined,tokenFile(),transport);
 expect(await p.execute({language:'python',source:'print(42)',stdin:''})).toEqual(result);
 expect(JSON.parse(transport.mock.calls[0][1].body)).toMatchObject({language:'python',stdin:['']});expect(transport.mock.calls[0][0]).toBe('http://127.0.0.1:4010/execute');
 transport.mockResolvedValueOnce(Response.json({results:[result]}));await expect(p.executeBatch({language:'python',source:'x'},['1','2'])).rejects.toMatchObject({code:'DOCKER_RUNNER_UNAVAILABLE'});
 transport.mockResolvedValueOnce(Response.json({results:[{...result,score:100}]}));await expect(p.execute({language:'python',source:'x',stdin:''})).rejects.toMatchObject({code:'DOCKER_RUNNER_UNAVAILABLE'});
});
it('checks worker availability and rejects incompatible safety limits',async()=>{
 const transport=vi.fn().mockResolvedValue(Response.json({ready:true,limits:dockerLimits}));const p=new DockerExecutionProvider(undefined,tokenFile(),transport);expect((await p.availability()).available).toBe(true);
 transport.mockResolvedValueOnce(Response.json({ready:true,limits:{...dockerLimits,memoryKb:0}}));expect((await p.availability()).available).toBe(false);
});
it.each([429,500])('sanitizes HTTP %s failures without fallback or retries',async status=>{
 const transport=vi.fn().mockResolvedValue(new Response('SECRET',{status}));const p=new DockerExecutionProvider(undefined,tokenFile(),transport);
 await expect(p.execute({language:'java',source:'class Main {}',stdin:''})).rejects.toMatchObject({code:status===429?'EXECUTION_LIMITED':'DOCKER_RUNNER_UNAVAILABLE'});expect(transport).toHaveBeenCalledTimes(1);
});
it('handles network/timeout failures and oversized output safely',async()=>{
 const transport=vi.fn().mockRejectedValue(new Error('SECRET'));const p=new DockerExecutionProvider(undefined,tokenFile(),transport);
 await expect(p.execute({language:'cpp',source:'x',stdin:''})).rejects.toMatchObject({status:503});
 transport.mockResolvedValueOnce(new Response('x'.repeat(500001)));await expect(p.execute({language:'cpp',source:'x',stdin:''})).rejects.toMatchObject({status:503});
});
