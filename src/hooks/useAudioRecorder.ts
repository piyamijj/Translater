'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderMode = 'continuous' | 'push-to-talk';

export interface UseAudioRecorderOptions {
  mode: RecorderMode;
  /** Called with a finished audio chunk ready to send to an AI provider. */
  onChunkReady: (blob: Blob, mimeType: string) => void;
  /** ms of near-silence before a continuous-mode utterance is flushed. */
  silenceTimeoutMs?: number;
  /** 0..1 — higher = only very clear speech resets the silence timer. */
  vadSensitivity?: number;
}

export interface UseAudioRecorderResult {
  isRecording: boolean;
  audioLevel: number; // 0..1, live RMS-ish level for the visualizer
  analyserNode: AnalyserNode | null;
  error: string | null;
  /** Push-to-talk: call on mic-button press. Continuous: call once to start listening. */
  start: () => Promise<void>;
  /** Push-to-talk: call on mic-button release. Continuous: call to stop listening. */
  stop: () => void;
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function pickSupportedMimeType(): string {
  for (const type of PREFERRED_MIME_TYPES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

/**
 * Captures microphone audio in chunks suitable for streaming STT/translation.
 *
 * - push-to-talk: records continuously while held, flushes one chunk on release.
 * - continuous: uses a simple energy-based VAD (via AnalyserNode RMS) to detect
 *   speech pauses and auto-flush an utterance ~silenceTimeoutMs after the user
 *   stops talking, then keeps listening for the next utterance — hands-free.
 */
export function useAudioRecorder(options: UseAudioRecorderOptions): UseAudioRecorderResult {
  const { mode, onChunkReady, silenceTimeoutMs = 700, vadSensitivity = 0.5 } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpokenRef = useRef(false);
  const mimeTypeRef = useRef('');

  const cleanupAudioGraph = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setAnalyserNode(null);
    setAudioLevel(0);
  }, []);

  const flushRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const startLevelLoop = useCallback(
    (analyser: AnalyserNode) => {
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const centered = (data[i] - 128) / 128;
          sumSquares += centered * centered;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        setAudioLevel(Math.min(1, rms * 4));

        // Simple VAD: threshold scales inversely with sensitivity.
        const speechThreshold = 0.02 + (1 - vadSensitivity) * 0.06;

        if (mode === 'continuous') {
          if (rms > speechThreshold) {
            hasSpokenRef.current = true;
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          } else if (hasSpokenRef.current && !silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              hasSpokenRef.current = false;
              silenceTimerRef.current = null;
              flushRecorder(); // finalize this utterance
            }, silenceTimeoutMs);
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [mode, silenceTimeoutMs, vadSensitivity, flushRecorder]
  );

  const beginNewRecorderSegment = useCallback(
    (stream: MediaStream) => {
      const mimeType = mimeTypeRef.current;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (blob.size > 0) onChunkReady(blob, mimeType);

        // Continuous mode: immediately arm a new segment so the next utterance
        // is captured without the user needing to press anything.
        if (mode === 'continuous' && streamRef.current && streamRef.current.active) {
          beginNewRecorderSegmentRef.current?.(streamRef.current);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
    },
    [mode, onChunkReady]
  );

  // Allow the onstop closure above to call the latest version of itself.
  const beginNewRecorderSegmentRef = useRef(beginNewRecorderSegment);
  useEffect(() => {
    beginNewRecorderSegmentRef.current = beginNewRecorderSegment;
  }, [beginNewRecorderSegment]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      mimeTypeRef.current = pickSupportedMimeType();

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx: AudioContext = new AudioCtx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      setAnalyserNode(analyser);

      hasSpokenRef.current = mode === 'push-to-talk'; // PTT always flushes on release
      beginNewRecorderSegment(stream);
      startLevelLoop(analyser);
      setIsRecording(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Mikrofon erişimi reddedildi veya kullanılamıyor.'
      );
      cleanupAudioGraph();
    }
  }, [beginNewRecorderSegment, cleanupAudioGraph, mode, startLevelLoop]);

  const stop = useCallback(() => {
    setIsRecording(false);
    flushRecorder();
    cleanupAudioGraph();
    recorderRef.current = null;
  }, [cleanupAudioGraph, flushRecorder]);

  useEffect(() => () => cleanupAudioGraph(), [cleanupAudioGraph]);

  return { isRecording, audioLevel, analyserNode, error, start, stop };
}
