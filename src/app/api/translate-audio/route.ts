import { NextRequest, NextResponse } from 'next/server';

// Node.js serverless runtime (not `edge`): we may sequentially retry several
// API keys across two providers on a rate-limit, and Node functions support a
// real configurable duration budget (`maxDuration`) — the edge runtime's much
// tighter hard ceiling was exactly what let a Vercel platform timeout page
// (HTML, not JSON) leak back to the client and crash its `.json()` parse once
// multi-key retries were added.
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * PRIMARY zero-setup translation path. This app ships with server-side
 * default API keys (configured as Vercel project environment variables)
 * so it works immediately for non-technical end users with no setup at
 * all — no key entry, no settings screen to get through first.
 *
 * The client (useTranslation -> provider-factory) calls this route with
 * the raw recorded audio chunk whenever the user hasn't entered their own
 * API key in Settings. If the user HAS entered their own key for a
 * provider (an optional, advanced override), that key is tried FIRST —
 * but the app's own baked-in key pool is still used as a safety-net
 * fallback if the user's personal key hits its own quota, so a BYOK
 * hiccup never hard-fails the request.
 *
 * Providers + models:
 *  - Gemini: gemini-flash-latest (native audio understanding: one call
 *    does transcription + translation together).
 *  - Groq: whisper-large-v3 for transcription, then openai/gpt-oss-120b
 *    for translation (Groq doesn't do audio-in on gpt-oss-120b, so it's a
 *    two-stage pipeline).
 *
 * Key rotation: the app was given several keys per provider, not just
 * one. GEMINI_API_KEYS / GROQ_API_KEYS hold them as a comma-separated
 * list (falling back to the single GEMINI_API_KEY / GROQ_API_KEY var if
 * the plural one isn't set). On a 429 (rate limit / quota exhausted) from
 * one key, the next key in that provider's pool is tried automatically;
 * only once EVERY key in a provider's pool has failed does the route move
 * on to the other provider's pool. An error only reaches the end user if
 * literally every key of every provider failed.
 */

interface AudioTranslateResult {
  sourceText: string;
  sourceLangGuess: string | null;
  translatedText: string;
  providerUsed: 'gemini' | 'groq';
}

class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

// ---------------------------------------------------------------------------
// Module-scope (per warm serverless instance) cooldown so a key we just
// learned is rate-limited/exhausted for the day isn't retried on every
// single subsequent request from this instance. Not persisted across cold
// starts/instances — that's fine, it's purely a latency optimization; the
// pool + fallback logic below is what guarantees correctness regardless.
// ---------------------------------------------------------------------------
const KEY_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const exhaustedUntil = new Map<string, number>();

function isCoolingDown(key: string): boolean {
  const until = exhaustedUntil.get(key);
  return typeof until === 'number' && Date.now() < until;
}

function markExhausted(key: string) {
  exhaustedUntil.set(key, Date.now() + KEY_COOLDOWN_MS);
}

/** Parse a comma-separated key-pool env var, falling back to a single-key env var. */
function parseKeyPool(envMulti: string | undefined, envSingle: string | undefined): string[] {
  const fromMulti = (envMulti ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const pool = fromMulti.length > 0 ? fromMulti : (envSingle ?? '').trim() ? [envSingle!.trim()] : [];
  return Array.from(new Set(pool));
}

/** Build the ordered key list to try: an override key first (if any), then the app's own pool. */
function buildAttemptOrder(overrideKey: string | undefined, pool: string[]): string[] {
  const ordered = overrideKey ? [overrideKey, ...pool.filter((k) => k !== overrideKey)] : [...pool];
  return ordered;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // Encode manually, chunked to avoid blowing the call stack on large clips.
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function safeParseGeminiJson(raw: string): {
  source_text?: string;
  source_lang?: string;
  translated_text?: string;
} {
  const cleaned = raw
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { source_text: '', source_lang: undefined, translated_text: cleaned };
  }
}

async function translateWithGeminiOnce(
  audioBuffer: ArrayBuffer,
  mimeType: string,
  targetLanguage: string,
  apiKey: string
): Promise<AudioTranslateResult> {
  const base64Audio = arrayBufferToBase64(audioBuffer);

  const prompt = [
    'You are a real-time speech translation engine. Detect the spoken language yourself — never assume it matches the target language.',
    'Listen to the attached audio clip and respond with ONLY a JSON object matching the given schema.',
    '',
    '- "source_text": verbatim transcription of the speech in its ORIGINAL language, exactly as spoken.',
    '- "source_lang": your best guess at the spoken language, as an ISO 639-1 code or short name.',
    `- "translated_text": a COMPLETE, natural, fluent translation of the ENTIRE utterance into the language with code "${targetLanguage}".`,
    '',
    'Hard rules — follow every one of these:',
    '1. ALWAYS produce a translation, even for very short clips, single words, or ambiguous fragments. Do your best rather than skipping it.',
    '2. NEVER copy "source_text" into "translated_text" unchanged. The only exception is when the speech is ALREADY in the target language — in that case translated_text may equal source_text verbatim.',
    '3. Translate the FULL sentence, start to finish. Never stop partway, never drop the ending, never summarize — a short input still gets a complete, un-truncated translation.',
    '4. If you are unsure of the exact source language, still make your best-effort translation into the target language rather than leaving it untranslated.',
    'If the audio is truly silent with no speech at all, return empty strings for all three fields.',
  ].join('\n');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType || 'audio/webm', data: base64Audio } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          // gemini-flash-latest has "thinking" on by default, which eats into
          // the output token budget and was truncating short translations —
          // this is a fast, deterministic task with no need for it.
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              source_text: { type: 'STRING' },
              source_lang: { type: 'STRING' },
              translated_text: { type: 'STRING' },
            },
            required: ['source_text', 'source_lang', 'translated_text'],
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new UpstreamError(`Gemini isteği başarısız oldu (${res.status}): ${errText.slice(0, 300)}`, res.status);
  }

  const json = await res.json();
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = safeParseGeminiJson(text);

  return {
    sourceText: parsed.source_text ?? '',
    sourceLangGuess: parsed.source_lang ?? null,
    translatedText: parsed.translated_text ?? '',
    providerUsed: 'gemini',
  };
}

async function translateWithGroqOnce(
  audioBlob: Blob,
  mimeType: string,
  targetLanguage: string,
  apiKey: string
): Promise<AudioTranslateResult> {
  const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') ? 'm4a' : 'webm';
  const form = new FormData();
  form.append('file', new File([audioBlob], `chunk.${ext}`, { type: mimeType || 'audio/webm' }));
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');

  const sttRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });
  if (!sttRes.ok) {
    const errText = await sttRes.text().catch(() => '');
    throw new UpstreamError(`Groq STT isteği başarısız oldu (${sttRes.status}): ${errText.slice(0, 300)}`, sttRes.status);
  }
  const sttJson = await sttRes.json();
  const sourceText: string = sttJson.text?.trim() ?? '';
  const sourceLangGuess: string | null = sttJson.language ?? null;

  if (!sourceText) {
    return { sourceText: '', sourceLangGuess, translatedText: '', providerUsed: 'groq' };
  }

  const chatRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      temperature: 0.2,
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: [
            `You are a professional simultaneous interpreter. Translate the user's message into the language with code "${targetLanguage}".`,
            'Rules: (1) Always produce a complete translation, even for short or fragmentary text — never skip it. ',
            '(2) Never reply with the input unchanged unless it is already written in the target language. ',
            '(3) Translate the full message end to end — never truncate or summarize partway. ',
            'Reply with ONLY the translated text, no quotes, no explanation.',
          ].join(''),
        },
        { role: 'user', content: sourceText },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!chatRes.ok) {
    const errText = await chatRes.text().catch(() => '');
    throw new UpstreamError(`Groq çeviri isteği başarısız oldu (${chatRes.status}): ${errText.slice(0, 300)}`, chatRes.status);
  }
  const chatJson = await chatRes.json();
  const translatedText: string = chatJson.choices?.[0]?.message?.content?.trim() ?? '';

  return { sourceText, sourceLangGuess, translatedText, providerUsed: 'groq' };
}

/**
 * Tries every key in `keys`, in order, skipping any currently in cooldown.
 * On a 429 the key is marked exhausted and we move to the next one. On any
 * other error we also move to the next key (it may be an individually
 * invalid/revoked key) rather than failing the whole provider outright.
 * Returns the first successful result, or throws the last error once every
 * key has been tried (or is cooling down).
 */
async function tryKeyPool<T>(
  keys: string[],
  attempt: (key: string) => Promise<T>
): Promise<T> {
  let lastError: unknown = new Error('Anahtar havuzu boş.');
  let triedAny = false;

  for (const key of keys) {
    if (isCoolingDown(key)) continue;
    triedAny = true;
    try {
      return await attempt(key);
    } catch (err) {
      lastError = err;
      if (err instanceof UpstreamError && err.status === 429) {
        markExhausted(key);
      }
      // try the next key regardless of failure reason
    }
  }

  if (!triedAny) {
    // Every key was cooling down — try them anyway rather than hard-failing,
    // in case the rate limit was hourly/burst rather than a full daily
    // exhaustion (best-effort; we'd rather attempt than give up silently).
    for (const key of keys) {
      try {
        return await attempt(key);
      } catch (err) {
        lastError = err;
      }
    }
  }

  throw lastError;
}

export async function POST(req: NextRequest) {
  // Everything below is wrapped in one top-level try/catch: no matter what
  // goes wrong (bad input, a network hiccup, an unexpected upstream shape,
  // every key failing), the response is ALWAYS NextResponse.json(...) with
  // an explicit status — never an unhandled exception that could surface a
  // platform-level HTML error page to the client.
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Geçersiz form verisi' }, { status: 400 });
    }

    const audio = form.get('audio');
    const mimeType = String(form.get('mimeType') ?? 'audio/webm');
    const targetLanguage = String(form.get('targetLanguage') ?? 'tr');
    const preferredProvider = String(form.get('provider') ?? 'gemini') as 'gemini' | 'groq';
    const overrideApiKeyRaw = form.get('apiKey');
    const overrideApiKey = overrideApiKeyRaw ? String(overrideApiKeyRaw) : undefined;

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json({ error: 'Ses verisi eksik' }, { status: 400 });
    }

    let audioBuffer: ArrayBuffer;
    try {
      audioBuffer = await audio.arrayBuffer();
    } catch {
      return NextResponse.json({ error: 'Ses verisi okunamadı' }, { status: 400 });
    }

    const geminiPool = parseKeyPool(process.env.GEMINI_API_KEYS, process.env.GEMINI_API_KEY);
    const groqPool = parseKeyPool(process.env.GROQ_API_KEYS, process.env.GROQ_API_KEY);

    const geminiKeys = buildAttemptOrder(preferredProvider === 'gemini' ? overrideApiKey : undefined, geminiPool);
    const groqKeys = buildAttemptOrder(preferredProvider === 'groq' ? overrideApiKey : undefined, groqPool);

    const providerOrder: Array<'gemini' | 'groq'> = preferredProvider === 'groq' ? ['groq', 'gemini'] : ['gemini', 'groq'];

    let lastError: unknown = null;

    for (const provider of providerOrder) {
      try {
        if (provider === 'gemini' && geminiKeys.length > 0) {
          const result = await tryKeyPool(geminiKeys, (key) =>
            translateWithGeminiOnce(audioBuffer, mimeType, targetLanguage, key)
          );
          if (result.sourceText || result.translatedText) return NextResponse.json(result);
          lastError = new Error('Gemini boş sonuç döndürdü');
          continue;
        }
        if (provider === 'groq' && groqKeys.length > 0) {
          const result = await tryKeyPool(groqKeys, (key) =>
            translateWithGroqOnce(new Blob([audioBuffer], { type: mimeType }), mimeType, targetLanguage, key)
          );
          if (result.sourceText || result.translatedText) return NextResponse.json(result);
          lastError = new Error('Groq boş sonuç döndürdü');
          continue;
        }
      } catch (err) {
        lastError = err;
      }
    }

    return NextResponse.json(
      {
        error:
          lastError instanceof Error
            ? lastError.message
            : 'Sunucu taraflı çeviri sağlayıcılarının hiçbiri yanıt vermedi.',
      },
      { status: 502 }
    );
  } catch (err) {
    // Absolute last resort — should be unreachable given the structure above,
    // but guarantees a JSON body no matter what.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sunucuda beklenmeyen bir hata oluştu.' },
      { status: 500 }
    );
  }
}