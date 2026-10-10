import { Judge0Provider, type ExecutionProvider } from './codeExecution.js';
import { OneCompilerProvider } from './oneCompiler.js';
export interface ExecutionSettings { ONECOMPILER_ENABLED: boolean; ONECOMPILER_API_KEY?: string; ONECOMPILER_MAX_EXECUTIONS_PER_DAY: number; JUDGE0_SECURITY_CONFIRMED: boolean; JUDGE0_URL?: string; JUDGE0_API_KEY?: string }
export function configureExecution(settings: ExecutionSettings): { provider?: ExecutionProvider; message?: string } {
  if (settings.ONECOMPILER_ENABLED) {
    if (!settings.ONECOMPILER_API_KEY?.trim()) return { message: 'OneCompiler is enabled but its backend credential is missing. Drafts and demo actions remain available. No fallback provider is selected.' };
    return { provider: new OneCompilerProvider(settings.ONECOMPILER_API_KEY, undefined, settings.ONECOMPILER_MAX_EXECUTIONS_PER_DAY) };
  }
  return settings.JUDGE0_SECURITY_CONFIRMED && settings.JUDGE0_URL ? { provider: new Judge0Provider(settings.JUDGE0_URL, settings.JUDGE0_API_KEY) } : {};
}
