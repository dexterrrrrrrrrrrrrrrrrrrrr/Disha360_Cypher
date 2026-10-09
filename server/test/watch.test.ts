import { it, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

it('watches backend TypeScript only, ignoring imported dependencies and generated files', async () => {
  // Exercise the real configuration in an isolated fixture. Never edit installed
  // dependencies or application source to simulate filesystem notifications.
  const fixture = await mkdtemp(join(tmpdir(), 'disha360-watch-'));
  let watcher: ChildProcess | undefined;
  let output = '';
  const source = "import 'watch-fixture'; console.log('WATCHER_APP_STARTED'); process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);\n";
  const put = async (name: string, content = 'export const marker = 1;\n') => {
    const path = join(fixture, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, content);
  };
  const starts = () => (output.match(/WATCHER_APP_STARTED/g) || []).length;
  const waitForStarts = async (count: number) => {
    const deadline = Date.now() + 8000;
    while (starts() < count && Date.now() < deadline) await delay(50);
    expect(starts(), output).toBe(count);
  };
  try {
    await put('package.json', '{"type":"module"}');
    await put('src/index.ts', source);
    await put('node_modules/watch-fixture/package.json', '{"name":"watch-fixture","type":"module","main":"index.js"}');
    await put('node_modules/watch-fixture/index.js');
    const ignored = [
      'dist/index.ts', 'build/index.ts', 'coverage/output.ts', 'logs/output.ts', 'tmp/output.ts',
      'src/node_modules/vendor/index.ts', 'src/dist/output.ts', 'src/build/output.ts',
      'src/generated/output.ts', 'src/logs/output.ts', 'src/tmp/output.ts', 'src/temp/output.ts',
      'src/.cache/output.ts', 'src/.tmp/output.ts', 'src/runtime.log', 'src/editor.tmp.ts',
      'src/editor.temp.ts', 'src/editor.ts~', 'src/editor.swp', 'src/compiler.tsbuildinfo',
      'client/src/index.ts'
    ];
    for (const name of ignored) await put(name);
    watcher = spawn(process.execPath, [join(root, 'node_modules/nodemon/bin/nodemon.js'), '--config', join(root, 'server/nodemon.json')], {
      cwd: fixture, env: { ...process.env, PATH: `${join(root, 'node_modules/.bin')}${delimiter}${process.env.PATH || ''}` }, stdio: ['ignore', 'pipe', 'pipe']
    });
    watcher.stdout!.on('data', chunk => { output += chunk.toString(); });
    watcher.stderr!.on('data', chunk => { output += chunk.toString(); });
    await waitForStarts(1);
    await delay(500); // Let the initial filesystem scan settle before mutations.
    await put('node_modules/watch-fixture/index.js', 'export const marker = 2;\n');
    for (const name of ignored) await put(name, 'export const marker = 2;\n');
    await delay(1500);
    expect(starts(), output).toBe(1);
    await put('src/index.ts', `${source}// Actual backend source edit\n`);
    await waitForStarts(2);
    await put('src/newModule.ts');
    await waitForStarts(3);
    await rm(join(fixture, 'src/newModule.ts'));
    await waitForStarts(4);
    expect(output).not.toContain('app crashed');
  } finally {
    if (watcher && watcher.exitCode === null) {
      await new Promise<void>(resolve => {
        const forceKill = setTimeout(() => watcher!.kill('SIGKILL'), 3000);
        watcher!.once('exit', () => { clearTimeout(forceKill); resolve(); });
        watcher!.kill('SIGTERM');
      });
    }
    await rm(fixture, { recursive: true, force: true });
  }
}, 30000);
