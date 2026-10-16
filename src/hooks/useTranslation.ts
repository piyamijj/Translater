'use client';

import { prepareAudio } from '@/lib/audio';
import { isGhostText } from '@/lib/ai/hallucination';
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
    async (rawBlob: Blob, rawMime: string) => {
      let blob = rawBlob;
      let mimeType = rawMime;
      if (blob.size < 800) return; // ignore near-empty noise blips

      // Gate on REAL speech: decode the samples, measure them, and drop the
      // chunk locally if there was only silence / room noise. Nothing is sent
      // to the AI (so nothing can be hallucinated) unless someone really spoke.
      const prepared = await prepareAudio(blob, mimeType);
      if (!prepared.hasSpeech) return;
      blob = prepared.blob;
      mimeType = prepared.mimeType;

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
        if (isGhostText(result.sourceText)) return; // stock/looping STT ghost

        // Same utterance twice in a row (double trigger / echo) -> ignore.
        const prev = usePolyGlotStore.getState().transcript.slice(-1)[0];
        if (
          prev &&
          Date.now() - prev.createdAt < 20_000 &&
          prev.sourceText.trim() === result.sourceText.trim()
        ) {
          return;
        }


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
