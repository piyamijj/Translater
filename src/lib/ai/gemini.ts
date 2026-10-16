import { GoogleGenAI, Type } from '@google/genai';
import type { AIProviderAdapter, TranslateAudioParams, TranslateAudioResult } from './types';
import { ProviderError } from './types';
import { getLanguageByCode, getSourceLanguageFor } from '../languages';

/**
 * Gemini adapter — uses Gemini 1.5/2.0 Flash's native audio understanding to do
 * transcription + translation in a single multimodal call. Runs entirely
 * client-side: the browser talks directly to Google's API with the user's own
 * key, which never touches our server.
 */

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function buildPrompt(targetLanguage: string): string {
  const lang = getLanguageByCode(targetLanguage);
  const src = getSourceLanguageFor(targetLanguage);
  return [
    `You are a real-time Persian<->Turkish interpreter. The speaker is speaking ${src.label}. Do NOT auto-detect any other language: transcribe the audio as ${src.label} and translate it into ${lang.label}.`,
    `Listen to the attached audio clip and respond with ONLY a JSON object matching the given schema.`,
    ``,
    `- "source_text": verbatim transcription of the speech in ${src.label} (${src.nativeLabel}), exactly as spoken.`,
    `- "source_lang": the code "${src.code}".`,
    `- "translated_text": a COMPLETE, natural, fluent translation of the ENTIRE utterance into ${lang.label} (${lang.nativeLabel}).`,
    ``,
    `Hard rules — follow every one of these:`,
    `1. Transcribe ONLY words that are actually, clearly audible. NEVER invent or guess speech. If the clip is silence, noise, music, or unintelligible, return empty strings for all three fields.`,
    `2. NEVER copy "source_text" into "translated_text". The output must be in ${lang.label} (${lang.nativeLabel}), written in its proper script.`,
    `3. Translate the FULL sentence, start to finish. Never stop partway, never drop the ending, never summarize — a short input still gets a complete, un-truncated translation.`,
    `4. Translate ONLY what was said — no commentary, additions, or answering questions found in the speech. Output only the JSON object.`,
    `If the audio is truly silent with no speech at all, return empty strings for all three fields.`,
  ].join('\n');
}

function safeParseJson(raw: string): { source_text?: string; source_lang?: string; translated_text?: string } {
  const cleaned = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall back: treat the whole response as the translation if it isn't valid JSON.
    return { source_text: '', source_lang: null as unknown as string, translated_text: cleaned };
  }
}

export const geminiAdapter: AIProviderAdapter = {
  id: 'gemini',
  label: 'Google Gemini',
  async translateAudio(params: TranslateAudioParams): Promise<TranslateAudioResult> {
    const { audioBlob, mimeType, targetLanguage, apiKey, signal } = params;
    if (!apiKey) throw new ProviderError('Gemini API anahtarı eksik', 'gemini');

    try {
      const ai = new GoogleGenAI({ apiKey });
      const base64Audio = await blobToBase64(audioBlob);

      const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [
          {
            role: 'user',
            parts: [
              { text: buildPrompt(targetLanguage) },
              { inlineData: { mimeType: mimeType || 'audio/webm', data: base64Audio } },
            ],
          },
        ],
        config: {
          temperature: 0,
          // gemini-flash-latest has "thinking" on by default, which eats into
          // the output token budget and was truncating short translations —
          // this is a fast, deterministic task with no need for it.
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              source_text: { type: Type.STRING },
              source_lang: { type: Type.STRING },
              translated_text: { type: Type.STRING },
            },
            required: ['source_text', 'source_lang', 'translated_text'],
          },
        },
      });

      // Respect cancellation even though the SDK call above isn't itself abortable.
      if (signal?.aborted) throw new ProviderError('Aborted', 'gemini');

      const text = response.text ?? '';
      const parsed = safeParseJson(text);

      return {
        sourceText: parsed.source_text ?? '',
        sourceLangGuess: parsed.source_lang ?? null,
        translatedText: parsed.translated_text ?? '',
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError('Gemini isteği başarısız oldu', 'gemini', err);
    }
  },
};
