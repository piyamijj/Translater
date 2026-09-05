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
      if (!apiKey) throw new ProviderError('OpenAI API anahtarı eksik', 'openai');

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
      if (!sttRes.ok) throw new ProviderError(`OpenAI STT isteği başarısız oldu (${sttRes.status})`, 'openai');
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
      if (!chatRes.ok) throw new ProviderError(`OpenAI sohbet isteği başarısız oldu (${chatRes.status})`, 'openai');
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
    'Hiçbir AI sağlayıcısı başarılı olmadı. Ayarlar\'dan en az bir geçerli API anahtarı ekleyin.',
    'none',
    lastError
  );
}

export function getProviderAdapter(id: AIProviderId): AIProviderAdapter {
  return registry[id];
}

/**
 * Zero-setup path: calls the server's /api/translate-audio route, which
 * uses the app's own baked-in default Gemini/Groq keys (Vercel project env
 * vars) — no user-supplied key required at all. This is what the app uses
 * out of the box; translateWithFallback (direct client-side calls with a
 * user's own key) only kicks in once the user has entered a key of their
 * own in Settings, as an optional advanced override.
 */
/**
 * Reads a fetch Response as JSON, but never throws a raw parser exception.
 * A crashed/timed-out serverless function, a proxy error page, or any other
 * infrastructure hiccup can come back as an HTML error page instead of JSON
 * (e.g. Vercel's own timeout page) — if that ever slips past res.ok checks,
 * a plain `res.json()` throws a cryptic "Unexpected token '<'..." SyntaxError
 * that would otherwise surface verbatim to the end user. This always returns
 * a plain object instead, using the content-type as a first signal and
 * falling back to a safe try/catch either way.
 */
async function safeReadJson(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return {};
  }
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function translateViaServerDefault(
  preferredProvider: AIProviderId,
  request: Omit<TranslateAudioParams, 'apiKey'>
): Promise<TranslateAudioResult & { providerUsed: 'gemini' | 'groq' }> {
  const form = new FormData();
  form.append('audio', request.audioBlob, 'chunk');
  form.append('mimeType', request.mimeType);
  form.append('targetLanguage', request.targetLanguage);
  // The server route only knows gemini/groq (both have baked-in default
  // keys); an OpenAI preference falls back to gemini for the default path.
  form.append('provider', preferredProvider === 'groq' ? 'groq' : 'gemini');

  let res: Response;
  try {
    res = await fetch('/api/translate-audio', {
      method: 'POST',
      body: form,
      signal: request.signal,
    });
  } catch (err) {
    // Network-level failure (offline, DNS, aborted) — never a raw browser error.
    throw new ProviderError('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.', 'server-default', err);
  }

  if (!res.ok) {
    const errJson = await safeReadJson(res);
    const message = typeof errJson.error === 'string' ? errJson.error : '';
    throw new ProviderError(
      message || `Sunucu isteği başarısız oldu (${res.status})`,
      'server-default'
    );
  }

  const json = await safeReadJson(res);
  // A silent/unintelligible clip legitimately comes back with empty strings
  // for both fields (by design — see the route's prompt) — that is NOT an
  // error. What IS an error is the response having none of the expected
  // keys at all, which only happens when safeReadJson had to fall back to
  // `{}` (non-JSON body / parse failure) despite res.ok being true.
  if (!('sourceText' in json) && !('translatedText' in json)) {
    throw new ProviderError('Sunucudan geçerli bir yanıt alınamadı, lütfen tekrar deneyin.', 'server-default');
  }

  return {
    sourceText: typeof json.sourceText === 'string' ? json.sourceText : '',
    sourceLangGuess: typeof json.sourceLangGuess === 'string' ? json.sourceLangGuess : null,
    translatedText: typeof json.translatedText === 'string' ? json.translatedText : '',
    providerUsed: json.providerUsed === 'groq' ? 'groq' : 'gemini',
  };
}
