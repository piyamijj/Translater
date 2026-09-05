import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 30;

/**
 * PRIMARY zero-setup translation path. This app ships with server-side
 * default API keys (configured as Vercel project environment variables)
 * so it works immediately for non-technical end users with no setup at
 * all — no key entry, no settings screen to get through first.
 *
 * The client (useTranslation -> provider-factory) calls this route with
 * the raw recorded audio chunk whenever the user hasn't entered their own
 * API key in Settings. If the user HAS entered their own key for a
 * provider (an optional, advanced override), the client instead calls that
 * provider directly from the browser — bypassing this route entirely, so
 * a user-supplied key never touches this server.
 *
 * Providers + models:
 *  - Gemini: gemini-flash-latest (native audio understanding: one call
 *    does transcription + translation together).
 *  - Groq: whisper-large-v3 for transcription, then openai/gpt-oss-120b
 *    for translation (Groq doesn't do audio-in on gpt-oss-120b, so it's a
 *    two-stage pipeline).
 *
 * Both server default keys are tried in order (whichever the caller
 * prefers first, then the other) so the app keeps working even if one
 * provider is briefly down or rate-limited.
 */

interface AudioTranslateResult {
  sourceText: string;
  sourceLangGuess: string | null;
  translatedText: string;
  providerUsed: 'gemini' | 'groq';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // Edge runtime has no Node `Buffer` — encode manually via btoa, chunked to
  // avoid blowing the call stack on large audio clips.
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

async function translateWithGemini(
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
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini isteği başarısız oldu (${res.status}): ${errText.slice(0, 300)}`);
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

async function translateWithGroq(
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
  });
  if (!sttRes.ok) {
    const errText = await sttRes.text().catch(() => '');
    throw new Error(`Groq STT isteği başarısız oldu (${sttRes.status}): ${errText.slice(0, 300)}`);
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
  });
  if (!chatRes.ok) {
    const errText = await chatRes.text().catch(() => '');
    throw new Error(`Groq çeviri isteği başarısız oldu (${chatRes.status}): ${errText.slice(0, 300)}`);
  }
  const chatJson = await chatRes.json();
  const translatedText: string = chatJson.choices?.[0]?.message?.content?.trim() ?? '';

  return { sourceText, sourceLangGuess, translatedText, providerUsed: 'groq' };
}

export async function POST(req: NextRequest) {
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
  const overrideApiKey = form.get('apiKey');

  if (!audio || !(audio instanceof Blob)) {
    return NextResponse.json({ error: 'Ses verisi eksik' }, { status: 400 });
  }

  const geminiKey =
    (preferredProvider === 'gemini' && overrideApiKey ? String(overrideApiKey) : '') ||
    process.env.GEMINI_API_KEY ||
    '';
  const groqKey =
    (preferredProvider === 'groq' && overrideApiKey ? String(overrideApiKey) : '') ||
    process.env.GROQ_API_KEY ||
    '';

  const order: Array<'gemini' | 'groq'> = preferredProvider === 'groq' ? ['groq', 'gemini'] : ['gemini', 'groq'];

  let lastError: unknown = null;
  const audioBuffer = await audio.arrayBuffer();

  for (const provider of order) {
    try {
      if (provider === 'gemini' && geminiKey) {
        const result = await translateWithGemini(audioBuffer, mimeType, targetLanguage, geminiKey);
        if (result.sourceText || result.translatedText) return NextResponse.json(result);
        lastError = new Error('Gemini boş sonuç döndürdü');
        continue;
      }
      if (provider === 'groq' && groqKey) {
        const result = await translateWithGroq(
          new Blob([audioBuffer], { type: mimeType }),
          mimeType,
          targetLanguage,
          groqKey
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
}
