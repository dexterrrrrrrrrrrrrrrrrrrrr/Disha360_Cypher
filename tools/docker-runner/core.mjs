import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
export const limits = Object.freeze({ wallSeconds: 5, compileSeconds: 10, memoryKb: 524288, outputBytes: 16384, processes: 64, cpus: 1, cases: 10, concurrency: 1, jobSeconds: 75 });
const socket = process.env.DISHA_DOCKER_SOCKET || (process.platform === 'darwin' && existsSync(`${homedir()}/.docker/run/docker.sock`) ? `${homedir()}/.docker/run/docker.sock` : '/var/run/docker.sock');
if (!socket.startsWith('/') || socket.includes('\0')) throw new Error('Use a local Unix Docker socket.');
const proxyKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'];
export function containerArgs(name, image) {
  return ['create', '--pull=never', '--name', name, '--label', 'disha360.runner=true', '--user', '65534:65534', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--memory', '512m', '--memory-swap', '512m', '--cpus', '1', '--pids-limit', '64', '--ipc', 'private', '--cgroupns', 'private', '--log-driver', 'none', '--ulimit', 'nofile=64:64', '--ulimit', 'fsize=33554432:33554432', '--tmpfs', '/workspace:rw,exec,nosuid,nodev,size=33554432,uid=65534,gid=65534,mode=700', '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=8388608,uid=65534,gid=65534,mode=700', ...proxyKeys.flatMap(key => ['--env', `${key}=`]), '--workdir', '/workspace', image];
}
// Only fixed Docker CLI commands run on the host. Student source is data on stdin,
// never a command, host file, shell argument, volume, environment or image selector.
export function docker(args, { input, timeoutMs = 10000, outputBytes = 100000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [`--host=unix://${socket}`, ...args], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), size = 0, timedOut = false, truncated = false;
    const stop = () => child.kill('SIGKILL');
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const collect = channel => chunk => { const available = Math.max(0, outputBytes - size); const piece = chunk.subarray(0, available); size += chunk.length; if (channel === 'stdout') stdout = Buffer.concat([stdout, piece]); else stderr = Buffer.concat([stderr, piece]); if (size > outputBytes) { truncated = true; stop(); } };
    child.stdout.on('data', collect('stdout')); child.stderr.on('data', collect('stderr'));
    child.stdin.on('error', () => {}); child.on('error', reject);
    signal?.addEventListener('abort', stop, { once: true }); if (signal?.aborted) stop();
    child.on('close', (code, killedSignal) => { clearTimeout(timer); signal?.removeEventListener('abort', stop); resolve({ stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), code, signal: killedSignal, timedOut, truncated }); });
    child.stdin.end(input ?? '');
  });
}
async function checked(args, options) { const r = await docker(args, options); if (r.code !== 0 || r.timedOut || r.truncated) throw new Error('Docker operation failed.'); return r.stdout; }
export function validateJob(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['language', 'source', 'stdin'].includes(k))) throw new Error('Invalid execution request.');
  if (!['python', 'java', 'cpp', 'javascript'].includes(input.language) || typeof input.source !== 'string' || !input.source.trim() || input.source.length > 30000) throw new Error('Invalid source or language.');
  const values = Array.isArray(input.stdin) ? input.stdin : [input.stdin ?? ''];
  if (!values.length || values.length > limits.cases || values.some(v => typeof v !== 'string' || v.length > 10000)) throw new Error('Invalid test inputs.');
  return { ...input, values };
}
function commands(language, source) {
  const javaClass = source.match(/\bpublic\s+(?:(?:final|abstract)\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/)?.[1] ?? 'Main';
  const javaVM = ['-Xmx128m', '-XX:ActiveProcessorCount=1', '-XX:+UseSerialGC'];
  return {
    python: { file: 'main.py', run: ['python3', '-I', 'main.py'] },
    javascript: { file: 'main.js', run: ['node', '--max-old-space-size=128', 'main.js'] },
    cpp: { file: 'main.cpp', compile: ['g++', '-std=c++17', '-O2', 'main.cpp', '-o', 'program'], run: ['./program'] },
    java: { file: `${javaClass}.java`, compile: ['javac', ...javaVM.map(v => `-J${v}`), `${javaClass}.java`], run: ['java', ...javaVM, '-cp', '.', javaClass] },
  }[language];
}
export function verifyContainer(c) {
  const h = c.HostConfig;
  if (c.Config.User !== '65534:65534' || !h.ReadonlyRootfs || h.Privileged || h.NetworkMode !== 'none' || h.Memory !== 536870912 || h.MemorySwap !== 536870912 || h.NanoCpus !== 1000000000 || h.PidsLimit !== 64 || h.PidMode === 'host' || h.IpcMode !== 'private' || h.CgroupnsMode !== 'private' || h.LogConfig?.Type !== 'none' || !h.CapDrop?.includes('ALL') || !h.SecurityOpt?.includes('no-new-privileges:true') || h.Binds?.length || h.Devices?.length || c.Mounts?.some(m => m.Type !== 'tmpfs') || !h.Tmpfs?.['/workspace'] || !h.Tmpfs?.['/tmp']) throw new Error('Sandbox controls could not be verified.');
  if (c.Config.Env.some(value => !/^(PATH|NODE_VERSION|YARN_VERSION)=/.test(value) && !proxyKeys.some(key => value === `${key}=`))) throw new Error('Unexpected container environment.');
}
export async function initialize() {
  const info = JSON.parse(await checked(['info', '--format', '{{json .}}']));
  if (!info.MemoryLimit || !info.SwapLimit || !info.PidsLimit || !info.CpuCfsQuota || !info.SecurityOptions?.some(v => v.startsWith('name=seccomp'))) throw new Error('Docker must support memory, CPU, PID and seccomp controls.');
  const image = JSON.parse(await checked(['image', 'inspect', process.env.DISHA_RUNNER_IMAGE || 'disha360-runner:local']))[0];
  if (!/^sha256:[a-f0-9]{64}$/.test(image.Id) || image.Config.Volumes) throw new Error('Build the trusted runner image first; images with volumes are rejected.');
  return image.Id; // Pin this immutable image ID; never pull during execution.
}
export async function executeCase(image, language, source, stdin, signal) {
  const name = `disha360-${randomUUID()}`;
  const result = { verdict: 'System Error', stdout: '', stderr: '', compileOutput: '', timeSeconds: null, memoryKb: null, exitCode: null, outputTruncated: false };
  let created = false;
  try {
    created = true; // Cleanup is attempted even if create was interrupted.
    await checked(containerArgs(name, image), { signal });
    await checked(['start', name], { signal });
    verifyContainer(JSON.parse(await checked(['inspect', name]))[0]);
    const command = commands(language, source);
    const prepare = `import sys,json,pathlib; d=json.load(sys.stdin); pathlib.Path(${JSON.stringify(command.file)}).write_text(d['source'],encoding='utf-8')`;
    await checked(['exec', '-i', name, 'python3', '-I', '-c', prepare], { input: JSON.stringify({ source }), signal });
    if (command.compile) {
      const compiled = await docker(['exec', name, ...command.compile], { timeoutMs: limits.compileSeconds * 1000, outputBytes: limits.outputBytes, signal });
      if (compiled.code !== 0 || compiled.truncated) return { ...result, verdict: compiled.timedOut ? 'Time Limit Exceeded' : 'Compilation Error', compileOutput: compiled.stdout + compiled.stderr, exitCode: compiled.code, outputTruncated: compiled.truncated };
    }
    const at = performance.now();
    const run = await docker(['exec', '-i', name, ...command.run], { input: stdin, timeoutMs: limits.wallSeconds * 1000, outputBytes: limits.outputBytes, signal });
    result.timeSeconds = Math.round((performance.now() - at) * 1000) / 1000000;
    const state = JSON.parse(await checked(['inspect', name]))[0].State;
    Object.assign(result, { stdout: run.stdout, stderr: run.stderr, exitCode: run.code, outputTruncated: run.truncated });
    result.verdict = run.timedOut ? 'Time Limit Exceeded' : state.OOMKilled ? 'Memory Limit Exceeded' : run.code === 0 && !run.truncated ? 'Accepted' : 'Runtime Error';
    if (run.truncated) result.exception = 'Output limit exceeded; the container was terminated.';
    return result;
  } finally {
    // Kill the entire sandbox, including children that forked or changed groups.
    // Cleanup failure fails the request and makes the worker stop accepting jobs.
    if (created) { const removed = await docker(['rm', '-f', name], { timeoutMs: 10000 }); if (removed.code !== 0 && !removed.stderr.includes('No such container')) throw new Error('Container cleanup could not be verified.'); }
  }
}
