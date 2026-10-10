import { DockerExecutionProvider } from './dockerExecution.js';
import { Judge0Provider, type ExecutionProvider } from './codeExecution.js';
import { OneCompilerProvider } from './oneCompiler.js';
export interface ExecutionSettings { NODE_ENV?: string; CODING_EXECUTION_PROVIDER?: 'auto' | 'docker' | 'onecompiler' | 'judge0' | 'disabled'; DOCKER_RUNNER_URL?: string; DOCKER_RUNNER_TOKEN_FILE?: string; ONECOMPILER_ENABLED: boolean; ONECOMPILER_API_KEY?: string; ONECOMPILER_MAX_EXECUTIONS_PER_DAY: number; JUDGE0_SECURITY_CONFIRMED: boolean; JUDGE0_URL?: string; JUDGE0_API_KEY?: string }
export function configureExecution(settings: ExecutionSettings): { provider?: ExecutionProvider; message?: string } {
  if (settings.CODING_EXECUTION_PROVIDER === 'disabled') return {};
  if (settings.CODING_EXECUTION_PROVIDER === 'docker') {
    if (settings.NODE_ENV !== 'development') return { message: 'The local Docker sandbox cannot activate outside development.' };
    try { return { provider: new DockerExecutionProvider(settings.DOCKER_RUNNER_URL, settings.DOCKER_RUNNER_TOKEN_FILE) }; } catch { return { message: 'Start npm run runner:dev after building the sandbox image, then restart the backend. See docs/DOCKER_SANDBOX.md. No cloud key is needed.' }; }
  }
  if (settings.CODING_EXECUTION_PROVIDER === 'onecompiler' || ((!settings.CODING_EXECUTION_PROVIDER || settings.CODING_EXECUTION_PROVIDER === 'auto') && settings.ONECOMPILER_ENABLED)) {
    if (!settings.ONECOMPILER_ENABLED) return { message: 'OneCompiler requires explicit enablement. No automatic provider fallback is used.' };
    if (!settings.ONECOMPILER_API_KEY?.trim()) return { message: 'OneCompiler is enabled but its backend credential is missing. Drafts and demo actions remain available. No fallback provider is selected.' };
    return { provider: new OneCompilerProvider(settings.ONECOMPILER_API_KEY, undefined, settings.ONECOMPILER_MAX_EXECUTIONS_PER_DAY) };
  }
  return settings.JUDGE0_SECURITY_CONFIRMED && settings.JUDGE0_URL ? { provider: new Judge0Provider(settings.JUDGE0_URL, settings.JUDGE0_API_KEY) } : {};
}
