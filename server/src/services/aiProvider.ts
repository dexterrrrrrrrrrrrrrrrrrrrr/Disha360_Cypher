import { OllamaAIService } from './ollamaAI.js';
import { AppError } from '../utils/AppError.js';
import { GeminiAIService, type GeminiClientFactory } from './geminiAI.js';
import { OpenAIInterviewProvider, type InterviewProvider } from './interviewProvider.js';

export interface AISettings {
  AI_PROVIDER: 'gemini' | 'openai' | 'ollama'; GEMINI_API_KEY?: string; GEMINI_API_KEY_BACKUP?: string;
  GEMINI_KEY_SELECTION: 'primary' | 'backup'; GEMINI_MODEL: string;
  OLLAMA_BASE_URL?: string; OLLAMA_MODEL?: string;
  OPENAI_API_KEY?: string; OPENAI_MODEL: string;
}
export function configureAI(settings: AISettings, createGeminiClient?: GeminiClientFactory): { provider?: InterviewProvider; setupMessage?: string } {
  if (settings.AI_PROVIDER === 'ollama') {
    try { return { provider: new OllamaAIService(settings.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434', settings.OLLAMA_MODEL ?? '') }; }
    catch { return { setupMessage: 'Configure OLLAMA_MODEL with an exact model name from ollama list, start ollama serve, and restart the backend. See docs/LOCAL_DEVELOPMENT.md. No model is automatically downloaded.' }; }
  }
  if (settings.AI_PROVIDER === 'openai') {
    return settings.OPENAI_API_KEY
      ? { provider: new OpenAIInterviewProvider(settings.OPENAI_API_KEY, settings.OPENAI_MODEL) }
      : { setupMessage: 'AI setup required: the selected OpenAI provider has no backend credential. No fallback provider or simulated responses are used.' };
  }
  try {
    return { provider: new GeminiAIService({ primaryKey: settings.GEMINI_API_KEY, backupKey: settings.GEMINI_API_KEY_BACKUP,
      keySelection: settings.GEMINI_KEY_SELECTION, model: settings.GEMINI_MODEL }, createGeminiClient) };
  } catch (error) {
    if (error instanceof AppError) return { setupMessage: error.message };
    return { setupMessage: 'Gemini setup could not be initialized. Ask the operator to check the backend configuration.' };
  }
}
