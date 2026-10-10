import { GoogleGenAI } from '@google/genai';
import type { AISettings } from './aiProvider.js';
import type { ExecutionSettings } from './executionProvider.js';

type Settings = AISettings & ExecutionSettings & { CODING_DEMO_MODE: boolean };
type ModelReader = (model: string, key: string) => Promise<{ name?: string; supportedActions?: string[] }>;
// Operator-only metadata lookup: no generation, code execution, billing changes,
// automatic credential rotation, model selection or database writes.
const readModel: ModelReader = (model, key) => new GoogleGenAI({ apiKey: key, vertexai: false, enterprise: false,
  httpOptions: { timeout: 10000, retryOptions: { attempts: 1 } } }).models.get({ model });

export async function checkProviders(settings: Settings, lookup: ModelReader = readModel) {
  const checks: { feature: string; status: 'blocked' | 'verified' | 'configured'; message: string }[] = [];
  const keyName = settings.GEMINI_KEY_SELECTION === 'backup' ? 'GEMINI_API_KEY_BACKUP' : 'GEMINI_API_KEY';
  const key = settings.GEMINI_KEY_SELECTION === 'backup' ? settings.GEMINI_API_KEY_BACKUP : settings.GEMINI_API_KEY;
  if (settings.AI_PROVIDER !== 'gemini') checks.push({ feature: 'Gemini interviews and coding mentor', status: 'blocked', message: 'Select AI_PROVIDER=gemini to use these Gemini workflows.' });
  else if (!key?.trim()) checks.push({ feature: 'Gemini interviews and coding mentor', status: 'blocked', message: `Missing ${keyName}. Configure it in secure backend environment settings; no key is requested in chat.` });
  else if (!/^gemini-[a-zA-Z0-9.-]+$/.test(settings.GEMINI_MODEL)) checks.push({ feature: 'Gemini model', status: 'blocked', message: 'Set GEMINI_MODEL to an exact currently supported Free Tier identifier. No model is guessed.' });
  else {
    try {
      const metadata = await lookup(settings.GEMINI_MODEL, key);
      if (metadata.name !== `models/${settings.GEMINI_MODEL}` || !metadata.supportedActions?.includes('generateContent')) throw new Error('Model capability not verified');
      checks.push({ feature: 'Gemini model', status: 'verified', message: 'Google metadata confirms the selected model and generateContent capability. Free Tier eligibility and generation quota still require account/documentation verification; no content was generated.' });
    } catch {
      checks.push({ feature: 'Gemini model', status: 'blocked', message: 'Model metadata verification failed. Check the selected credential, model identifier and outbound access. No raw provider errors, retries or fallback keys are exposed.' });
    }
  }
  if (settings.AI_PROVIDER === 'gemini' && !key?.trim() && !/^gemini-[a-zA-Z0-9.-]+$/.test(settings.GEMINI_MODEL))
    checks.push({ feature: 'Gemini model', status: 'blocked', message: 'GEMINI_MODEL is missing or malformed. Configure an exact supported Free Tier identifier alongside the credential; no model is guessed.' });
  if (!settings.ONECOMPILER_API_KEY?.trim()) checks.push({ feature: 'OneCompiler Run and Submit', status: 'blocked', message: 'Missing ONECOMPILER_API_KEY. Configure it in secure backend environment settings.' });
  else if (!settings.ONECOMPILER_ENABLED) checks.push({ feature: 'OneCompiler Run and Submit', status: 'blocked', message: 'Set ONECOMPILER_ENABLED=true after confirming free credits and billing restrictions.' });
  else if (settings.CODING_DEMO_MODE) checks.push({ feature: 'OneCompiler Run and Submit', status: 'blocked', message: 'Set CODING_DEMO_MODE=false to display real execution actions.' });
  else checks.push({ feature: 'OneCompiler Run and Submit', status: 'configured', message: 'Credential and feature settings are present. Credential validity, credits and execution remain unverified: this check never runs code or consumes execution credits.' });
  return { configurationReady: checks.every(c => c.status !== 'blocked'), checks };
}
