import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_TARGET_LANGUAGE } from './languages';

export type AIProviderId = 'gemini' | 'groq' | 'openai';
export type CaptureMode = 'continuous' | 'push-to-talk';

export interface ApiKeys {
  gemini: string;
  groq: string;
  openai: string;
}

export interface TranscriptEntry {
  id: string;
  createdAt: number;
  sourceText: string;
  translatedText: string;
  sourceLangGuess: string | null;
  targetLang: string;
  provider: AIProviderId;
  isFinal: boolean;
}

interface PolyGlotState {
  // Settings — API keys are the ONLY sensitive data, kept in localStorage only,
  // never sent anywhere except directly to each provider's own API endpoint.
  apiKeys: ApiKeys;
  activeProvider: AIProviderId;
  targetLanguage: string;
  captureMode: CaptureMode;
  ttsEnabled: boolean;
  vadSensitivity: number; // 0..1, higher = more sensitive to speech onset
  silenceTimeoutMs: number; // ms of silence before continuous mode auto-translates

  // Session (not persisted deeply, but harmless to keep in same store)
  transcript: TranscriptEntry[];
  isListening: boolean;
  isProcessing: boolean;

  setApiKey: (provider: AIProviderId, key: string) => void;
  setActiveProvider: (provider: AIProviderId) => void;
  setTargetLanguage: (lang: string) => void;
  setCaptureMode: (mode: CaptureMode) => void;
  setTtsEnabled: (enabled: boolean) => void;
  setVadSensitivity: (value: number) => void;
  setSilenceTimeoutMs: (value: number) => void;
  setIsListening: (value: boolean) => void;
  setIsProcessing: (value: boolean) => void;
  addTranscriptEntry: (entry: TranscriptEntry) => void;
  updateLastTranscriptEntry: (patch: Partial<TranscriptEntry>) => void;
  clearTranscript: () => void;
  hasAnyApiKey: () => boolean;
}

export const usePolyGlotStore = create<PolyGlotState>()(
  persist(
    (set, get) => ({
      apiKeys: { gemini: '', groq: '', openai: '' },
      activeProvider: 'gemini',
      targetLanguage: DEFAULT_TARGET_LANGUAGE,
      captureMode: 'push-to-talk',
      ttsEnabled: true,
      vadSensitivity: 0.5,
      silenceTimeoutMs: 700,

      transcript: [],
      isListening: false,
      isProcessing: false,

      setApiKey: (provider, key) =>
        set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
      setActiveProvider: (provider) => set({ activeProvider: provider }),
      setTargetLanguage: (lang) => set({ targetLanguage: lang }),
      setCaptureMode: (mode) => set({ captureMode: mode }),
      setTtsEnabled: (enabled) => set({ ttsEnabled: enabled }),
      setVadSensitivity: (value) => set({ vadSensitivity: value }),
      setSilenceTimeoutMs: (value) => set({ silenceTimeoutMs: value }),
      setIsListening: (value) => set({ isListening: value }),
      setIsProcessing: (value) => set({ isProcessing: value }),
      addTranscriptEntry: (entry) =>
        set((s) => ({ transcript: [...s.transcript, entry].slice(-200) })),
      updateLastTranscriptEntry: (patch) =>
        set((s) => {
          if (s.transcript.length === 0) return {};
          const next = [...s.transcript];
          next[next.length - 1] = { ...next[next.length - 1], ...patch };
          return { transcript: next };
        }),
      clearTranscript: () => set({ transcript: [] }),
      hasAnyApiKey: () => {
        const k = get().apiKeys;
        return Boolean(k.gemini || k.groq || k.openai);
      },
    }),
    {
      name: 'polyglot-live-ai:settings',
      storage: createJSONStorage(() => localStorage),
      // Never persist live session/processing flags — only durable settings + history.
      partialize: (s) => ({
        apiKeys: s.apiKeys,
        activeProvider: s.activeProvider,
        targetLanguage: s.targetLanguage,
        captureMode: s.captureMode,
        ttsEnabled: s.ttsEnabled,
        vadSensitivity: s.vadSensitivity,
        silenceTimeoutMs: s.silenceTimeoutMs,
        transcript: s.transcript,
      }),
    }
  )
);
