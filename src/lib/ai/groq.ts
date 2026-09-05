import Groq from 'groq-sdk';
import type { AIProviderAdapter, TranslateAudioParams, TranslateAudioResult } from './types';
import { ProviderError } from './types';
import { getLanguageByCode } from '../languages';

/**
 * Groq adapter — two-stage pipeline:
 *   1) whisper-large-v3 transcribes the raw audio (auto-detects source language).
 *   2) openai/gpt-oss-120b translates the transcript into the target language.
 * Both calls run client-side against Groq's OpenAI-compatible REST API using the
 * user's own key (dangerouslyAllowBrowser — this is a BYOK app, key never leaves
 * the browser except straight to Groq).
 */

function fileFromBlob(blob: Blob, mimeType: string): File {
  const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') ? 'm4a' : 'webm';
  return new File([blob], `chunk.${ext}`, { type: mimeType || 'audio/webm' });
}

export const groqAdapter: AIProviderAdapter = {
  id: 'groq',
  label: 'Groq (Whisper + Llama 3)',
  async translateAudio(params: TranslateAudioParams): Promise<TranslateAudioResult> {
    const { audioBlob, mimeType, targetLanguage, apiKey, signal } = params;
    if (!apiKey) throw new ProviderError('Groq API anahtarı eksik', 'groq');

    const client = new Groq({ apiKey, dangerouslyAllowBrowser: true });
    const lang = getLanguageByCode(targetLanguage);

    try {
      const transcription = await client.audio.transcriptions.create(
        {
          file: fileFromBlob(audioBlob, mimeType),
          model: 'whisper-large-v3',
          response_format: 'verbose_json',
          temperature: 0,
        },
        { signal }
      );

      const sourceText = (transcription as { text?: string }).text?.trim() ?? '';
      const sourceLangGuess = (transcription as { language?: string }).language ?? null;

      if (!sourceText) {
        return { sourceText: '', sourceLangGuess, translatedText: '' };
      }

      const chat = await client.chat.completions.create(
        {
          model: 'openai/gpt-oss-120b',
          temperature: 0.2,
          max_tokens: 1024,
          messages: [
            {
              role: 'system',
              content: [
                `You are a professional simultaneous interpreter. Translate the user's message into ${lang.label} (${lang.nativeLabel}).`,
                'Rules: (1) Always produce a complete translation, even for short or fragmentary text — never skip it. ',
                '(2) Never reply with the input unchanged unless it is already written in the target language. ',
                '(3) Translate the full message end to end — never truncate or summarize partway. ',
                'Reply with ONLY the translated text, no quotes, no explanation, no source-language repetition.',
              ].join(''),
            },
            { role: 'user', content: sourceText },
          ],
        },
        { signal }
      );

      const translatedText = chat.choices[0]?.message?.content?.trim() ?? '';

      return { sourceText, sourceLangGuess, translatedText };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError('Groq isteği başarısız oldu', 'groq', err);
    }
  },
};
