import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containerArgs, validateJob, verifyContainer } from './core.mjs';
test('container arguments enforce isolation without mounts, privileges, network or inherited credentials', () => {
 const args = containerArgs('fixture', 'sha256:fixture');
 for (const flag of ['--read-only','--cap-drop','--security-opt','--memory','--memory-swap','--cpus','--pids-limit','--tmpfs','--log-driver']) assert.ok(args.includes(flag));
 assert.ok(args.includes('none')); assert.ok(args.includes('65534:65534')); assert.ok(args.includes('no-new-privileges:true'));
 for (const flag of ['--privileged','--volume','-v','--mount','--device']) assert.ok(!args.includes(flag));
 assert.ok(args.includes('HTTP_PROXY=')); assert.ok(!args.some(a=>a.includes('runner-token')));
});
test('rejects unsupported languages, shell selectors, excessive code, input and case counts', () => {
 for (const value of [{language:'bash',source:'x'}, {language:'python',source:'x',command:'sh'}, {language:'python',source:'x'.repeat(30001)}, {language:'python',source:'x',stdin:['x'.repeat(10001)]}, {language:'python',source:'x',stdin:Array(11).fill('')}]) assert.throws(()=>validateJob(value));
 assert.deepEqual(validateJob({language:'java',source:'class Main {}',stdin:['1','2']}).values,['1','2']);
});
test('fails closed when runtime inspection cannot establish required controls', () => {
 assert.throws(()=>verifyContainer({Config:{User:'root'},HostConfig:{}}));
});
