import { GoogleGenAI } from '@google/genai';
import type { AIProviderAdapter, TranslateAudioParams, TranslateAudioResult } from './types';
import { ProviderError } from './types';
import { getLanguageByCode } from '../languages';

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
  return [
    `You are a real-time speech translation engine.`,
    `Listen to the attached audio clip and respond with ONLY a compact JSON object`,
    `(no markdown fences, no commentary) with exactly these keys:`,
    `{"source_text": string, "source_lang": string, "translated_text": string}`,
    ``,
    `- "source_text": verbatim transcription of the speech in its original language.`,
    `- "source_lang": your best guess at the spoken language, as an ISO 639-1 code or short name.`,
    `- "translated_text": natural, fluent translation of the speech into ${lang.label} (${lang.nativeLabel}).`,
    `If the audio is silent or unintelligible, return empty strings for all three fields.`,
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
        config: { temperature: 0.2 },
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
