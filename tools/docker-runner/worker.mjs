import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initialize, executeCase, validateJob, limits } from './core.mjs';
if ((process.env.NODE_ENV ?? 'development') !== 'development') throw new Error('The local Docker worker is development-only.');
const tokenFile = resolve(process.env.DOCKER_RUNNER_TOKEN_FILE || fileURLToPath(new URL('../../.disha-local/runner-token', import.meta.url)));
mkdirSync(dirname(tokenFile), { recursive: true, mode: 0o700 });
try { writeFileSync(tokenFile, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
const stat = lstatSync(tokenFile); if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.uid !== process.getuid?.()) throw new Error('Worker token must be an owned regular file with mode 600.');
const token = readFileSync(tokenFile, 'utf8').trim(); if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid local worker token file.');
const hash = text => createHash('sha256').update(text).digest();
const image = await initialize();
// Verify create/start/inspect/cleanup before reporting readiness.
const probe = await executeCase(image, 'python', 'print("runner-ready")', '', new AbortController().signal);
if (probe.verdict !== 'Accepted' || probe.stdout.trim() !== 'runner-ready') throw new Error('Sandbox preflight failed.');
let busy = false, healthy = true; let requests = []; let current;
const reply = (res, status, body) => { if (!res.destroyed) res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(JSON.stringify(body)); };
const server = createServer(async (req, res) => {
  const supplied = req.headers.authorization?.replace(/^Bearer /, '') || '';
  if (req.headers.origin || !timingSafeEqual(hash(supplied), hash(token))) return reply(res, 401, { error: 'Unauthorized worker request.' });
  if (req.method === 'GET' && req.url === '/health') return reply(res, healthy ? 200 : 503, { ready: healthy, limits });
  if (req.method !== 'POST' || req.url !== '/execute') return reply(res, 404, { error: 'Not found.' });
  const now = Date.now(); requests = requests.filter(at => now - at < 60000);
  if (!healthy) return reply(res, 503, { error: 'Worker requires recovery.' });
  if (busy || requests.length >= 30) return reply(res, 429, { error: 'Local runner is busy or rate-limited. Try again later.' });
  busy = true; requests.push(now);
  const controller = new AbortController(); current = controller;
  const abort = () => controller.abort(); res.once('close', abort);
  const timer = setTimeout(abort, limits.jobSeconds * 1000);
  let executing = false;
  try {
    if (!req.headers['content-type']?.startsWith('application/json')) return reply(res, 400, { error: 'Use application/json.' });
    const chunks = []; let bytes = 0;
    for await (const chunk of req.iterator({ destroyOnReturn: false })) { bytes += chunk.length; if (bytes > 250000) { req.resume(); return reply(res, 413, { error: 'Execution request too large.' }); } chunks.push(chunk); }
    let job; try { job = validateJob(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { return reply(res, 400, { error: 'Invalid source, language or test inputs.' }); }
    const results = []; executing = true;
    for (const stdin of job.values) { if (controller.signal.aborted) throw new Error('Job cancelled.'); results.push(await executeCase(image, job.language, job.source, stdin, controller.signal)); if (controller.signal.aborted) throw new Error('Job cancelled.'); }
    reply(res, 200, { results });
  } catch { if (executing && !controller.signal.aborted) healthy = false; reply(res, 503, { error: 'Sandbox execution failed or timed out. No result was fabricated; check the local worker.' }); }
  finally { clearTimeout(timer); res.off('close', abort); current = undefined; busy = false; }
});
server.requestTimeout = 80000; server.headersTimeout = 10000;
const port = Number(process.env.DOCKER_RUNNER_PORT || 4010);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid worker port.');
server.listen(port, '127.0.0.1', () => console.log(`Local Docker worker ready on loopback port ${port}; sandbox controls verified. No token is logged.`));
const shutdown = () => { current?.abort(); server.close(); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
