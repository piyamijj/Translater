/** Shared contract every AI provider adapter implements. */

export interface TranslateAudioParams {
  /** Raw audio chunk captured from the mic (webm/opus or wav, provider-dependent). */
  audioBlob: Blob;
  /** Mime type of audioBlob, e.g. 'audio/webm;codecs=opus'. */
  mimeType: string;
  /** BCP-47 target language code, e.g. 'tr'. */
  targetLanguage: string;
  apiKey: string;
  signal?: AbortSignal;
}

export interface TranslateAudioResult {
  /** Best-effort transcription of the source audio, in its original language. */
  sourceText: string;
  /** Best-effort guess at the source language (ISO code or name), if the provider reports one. */
  sourceLangGuess: string | null;
  /** Translated text in the requested target language. */
  translatedText: string;
}

export interface AIProviderAdapter {
  id: 'gemini' | 'groq' | 'openai';
  label: string;
  /** True STT+translate in one round trip from a recorded audio chunk. */
  translateAudio(params: TranslateAudioParams): Promise<TranslateAudioResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
