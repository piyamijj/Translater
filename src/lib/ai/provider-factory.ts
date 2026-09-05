import type { AIProviderAdapter, TranslateAudioParams, TranslateAudioResult } from './types';
import { ProviderError } from './types';
import { geminiAdapter } from './gemini';
import { groqAdapter } from './groq';
import type { AIProviderId, ApiKeys } from '../store';

const registry: Record<AIProviderId, AIProviderAdapter> = {
  gemini: geminiAdapter,
  groq: groqAdapter,
  // OpenAI (Whisper STT + GPT translation) — same shape as groq's 2-stage pipeline.
  // Implemented lazily below to keep the SDK import optional/tree-shakeable.
  openai: {
    id: 'openai',
    label: 'OpenAI (Whisper + GPT)',
    async translateAudio(params: TranslateAudioParams): Promise<TranslateAudioResult> {
      const { audioBlob, mimeType, targetLanguage, apiKey, signal } = params;
      if (!apiKey) throw new ProviderError('Missing OpenAI API key', 'openai');

      const form = new FormData();
      const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') ? 'm4a' : 'webm';
      form.append('file', new File([audioBlob], `chunk.${ext}`, { type: mimeType || 'audio/webm' }));
      form.append('model', 'whisper-1');

      const sttRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal,
      });
      if (!sttRes.ok) throw new ProviderError(`OpenAI STT failed (${sttRes.status})`, 'openai');
      const sttJson = await sttRes.json();
      const sourceText: string = sttJson.text?.trim() ?? '';
      if (!sourceText) return { sourceText: '', sourceLangGuess: null, translatedText: '' };

      const { getLanguageByCode } = await import('../languages');
      const lang = getLanguageByCode(targetLanguage);

      const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: `You are a professional simultaneous interpreter. Translate the user's message into ${lang.label} (${lang.nativeLabel}). Reply with ONLY the translated text.`,
            },
            { role: 'user', content: sourceText },
          ],
        }),
        signal,
      });
      if (!chatRes.ok) throw new ProviderError(`OpenAI chat failed (${chatRes.status})`, 'openai');
      const chatJson = await chatRes.json();
      const translatedText: string = chatJson.choices?.[0]?.message?.content?.trim() ?? '';

      return { sourceText, sourceLangGuess: null, translatedText };
    },
  },
};

/**
 * Resolves the active provider adapter and drives an automatic fallback chain:
 * try the user's chosen provider first, then fall back — in priority order —
 * to any OTHER provider for which the user has supplied a key. This keeps the
 * app usable even if one provider is down or rate-limited, without ever
 * requiring more than one key.
 */
export async function translateWithFallback(
  preferredProvider: AIProviderId,
  apiKeys: ApiKeys,
  request: Omit<TranslateAudioParams, 'apiKey'>
): Promise<TranslateAudioResult & { providerUsed: AIProviderId }> {
  const priorityOrder: AIProviderId[] = [
    preferredProvider,
    ...(['gemini', 'groq', 'openai'] as AIProviderId[]).filter((p) => p !== preferredProvider),
  ];

  let lastError: unknown = null;

  for (const providerId of priorityOrder) {
    const key = apiKeys[providerId];
    if (!key) continue;
    try {
      const result = await registry[providerId].translateAudio({ ...request, apiKey: key });
      return { ...result, providerUsed: providerId };
    } catch (err) {
      lastError = err;
      // try next provider in the chain
    }
  }

  if (lastError instanceof ProviderError) throw lastError;
  throw new ProviderError(
    'No AI provider succeeded. Add at least one valid API key in Settings.',
    'none',
    lastError
  );
}

export function getProviderAdapter(id: AIProviderId): AIProviderAdapter {
  return registry[id];
}
