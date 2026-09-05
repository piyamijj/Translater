'use client';

import { useCallback, useRef, useState } from 'react';
import { usePolyGlotStore } from '@/lib/store';
import { translateWithFallback, translateViaServerDefault } from '@/lib/ai/provider-factory';
import { speak } from '@/lib/tts';

export interface UseTranslationResult {
  processChunk: (blob: Blob, mimeType: string) => Promise<void>;
  lastError: string | null;
}

/**
 * Orchestrates the pipeline: audio chunk -> AI provider (STT + translation) ->
 * store update -> optional TTS playback of the translated text. This is the
 * glue between useAudioRecorder and the UI/store.
 */
export function useTranslation(): UseTranslationResult {
  const [lastError, setLastError] = useState<string | null>(null);
  const inFlightRef = useRef(0);

  const {
    apiKeys,
    activeProvider,
    targetLanguage,
    ttsEnabled,
    setIsProcessing,
    addTranscriptEntry,
    hasAnyApiKey,
  } = usePolyGlotStore();

  const processChunk = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (blob.size < 800) return; // ignore near-empty noise blips

      inFlightRef.current += 1;
      setIsProcessing(true);
      setLastError(null);

      try {
        // Zero-setup by default: only switch to the user's own key(s) once
        // they've actually entered one in Settings (an optional, advanced
        // override) — otherwise use the app's baked-in server-side default.
        const result = hasAnyApiKey()
          ? await translateWithFallback(activeProvider, apiKeys, {
              audioBlob: blob,
              mimeType,
              targetLanguage,
            })
          : await translateViaServerDefault(activeProvider, {
              audioBlob: blob,
              mimeType,
              targetLanguage,
            });

        if (!result.sourceText && !result.translatedText) return; // silence, skip

        addTranscriptEntry({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: Date.now(),
          sourceText: result.sourceText,
          translatedText: result.translatedText,
          sourceLangGuess: result.sourceLangGuess,
          targetLang: targetLanguage,
          provider: result.providerUsed,
          isFinal: true,
        });

        if (ttsEnabled && result.translatedText) {
          speak(result.translatedText, targetLanguage);
        }
      } catch (err) {
        setLastError(err instanceof Error ? err.message : 'Çeviri başarısız oldu.');
      } finally {
        inFlightRef.current -= 1;
        if (inFlightRef.current <= 0) setIsProcessing(false);
      }
    },
    [apiKeys, activeProvider, targetLanguage, ttsEnabled, setIsProcessing, addTranscriptEntry, hasAnyApiKey]
  );

  return { processChunk, lastError };
}
