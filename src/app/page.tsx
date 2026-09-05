'use client';

import { useCallback, useMemo } from 'react';
import { Mic, Radio, AlertTriangle, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { SettingsModal } from '@/components/SettingsModal';
import { LanguageSelector } from '@/components/LanguageSelector';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { TranslationDisplay } from '@/components/TranslationDisplay';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useTranslation } from '@/hooks/useTranslation';
import { usePolyGlotStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function HomePage() {
  const captureMode = usePolyGlotStore((s) => s.captureMode);
  const setCaptureMode = usePolyGlotStore((s) => s.setCaptureMode);
  const isProcessing = usePolyGlotStore((s) => s.isProcessing);
  const transcript = usePolyGlotStore((s) => s.transcript);
  const hasAnyApiKey = usePolyGlotStore((s) => s.hasAnyApiKey());
  const silenceTimeoutMs = usePolyGlotStore((s) => s.silenceTimeoutMs);
  const vadSensitivity = usePolyGlotStore((s) => s.vadSensitivity);

  const { processChunk, lastError } = useTranslation();

  const { isRecording, audioLevel, analyserNode, error, start, stop } = useAudioRecorder({
    mode: captureMode,
    onChunkReady: processChunk,
    silenceTimeoutMs,
    vadSensitivity,
  });

  const latestEntry = transcript[transcript.length - 1];

  const handleMicPress = useCallback(() => {
    if (captureMode === 'push-to-talk') {
      start();
    } else {
      isRecording ? stop() : start();
    }
  }, [captureMode, isRecording, start, stop]);

  const handleMicRelease = useCallback(() => {
    if (captureMode === 'push-to-talk') stop();
  }, [captureMode, stop]);

  const micLabel = useMemo(() => {
    if (captureMode === 'push-to-talk') return isRecording ? 'Çevirmek için bırakın' : 'Konuşmak için basılı tutun';
    return isRecording ? 'Dinleniyor… durdurmak için dokunun' : 'Dinlemeye başlamak için dokunun';
  }, [captureMode, isRecording]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-8">
      <header className="safe-area-top flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400">
            <Radio className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-none">PolyGlot Live AI</h1>
            <p className="text-[11px] text-muted-foreground">Gerçek zamanlı sesli çeviri</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <LanguageSelector />
          <SettingsModal />
        </div>
      </header>

      {!hasAnyApiKey && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <KeyRound className="h-4 w-4 shrink-0" />
          Çeviriye başlamak için Ayarlar&apos;dan bir API anahtarı ekleyin (Gemini, Groq veya OpenAI).
        </div>
      )}

      {(error || lastError) && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error || lastError}
        </div>
      )}

      <section className="mb-4 h-20 overflow-hidden rounded-2xl border border-border bg-card">
        <AudioVisualizer analyserNode={analyserNode} isActive={isRecording} />
      </section>

      <section className="flex-1">
        <TranslationDisplay entry={latestEntry} />
      </section>

      {transcript.length > 1 && (
        <details className="mt-4 rounded-xl border border-border bg-card/50 p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium">
            Geçmiş ({transcript.length - 1} önceki kayıt)
          </summary>
          <ul className="mt-2 space-y-2">
            {transcript
              .slice(0, -1)
              .slice(-20)
              .reverse()
              .map((e) => (
                <li key={e.id} className="border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
                  <p className="text-foreground/80">{e.sourceText}</p>
                  <p className="mt-0.5 font-medium text-foreground">{e.translatedText}</p>
                </li>
              ))}
          </ul>
        </details>
      )}

      <footer className="safe-area-bottom sticky bottom-0 mt-6 flex flex-col items-center gap-3 pt-2">
        <div className="flex gap-2 text-[11px] text-muted-foreground">
          <button
            onClick={() => setCaptureMode('push-to-talk')}
            className={cn(
              'rounded-full px-3 py-1 transition-colors',
              captureMode === 'push-to-talk' ? 'bg-secondary text-foreground' : 'hover:text-foreground'
            )}
          >
            Bas-konuş
          </button>
          <button
            onClick={() => setCaptureMode('continuous')}
            className={cn(
              'rounded-full px-3 py-1 transition-colors',
              captureMode === 'continuous' ? 'bg-secondary text-foreground' : 'hover:text-foreground'
            )}
          >
            Sürekli dinleme
          </button>
        </div>

        <div className="relative flex items-center justify-center">
          <AnimatePresence>
            {isRecording && (
              <motion.span
                initial={{ opacity: 0.6, scale: 0.9 }}
                animate={{ opacity: 0, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                className="absolute inline-block h-20 w-20 rounded-full bg-primary/40"
              />
            )}
          </AnimatePresence>
          <motion.div animate={{ scale: 1 + audioLevel * 0.15 }} transition={{ duration: 0.08 }}>
            <Button
              size="icon"
              disabled={!hasAnyApiKey}
              onMouseDown={handleMicPress}
              onMouseUp={handleMicRelease}
              onTouchStart={(e) => {
                e.preventDefault();
                handleMicPress();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                handleMicRelease();
              }}
              className={cn(
                'h-20 w-20 rounded-full shadow-lg shadow-primary/20',
                isRecording && 'bg-destructive hover:bg-destructive/90',
                isProcessing && 'animate-pulse'
              )}
              aria-label={micLabel}
            >
              <Mic className="h-8 w-8" />
            </Button>
          </motion.div>
        </div>
        <p className="text-xs text-muted-foreground">{isProcessing ? 'Çevriliyor…' : micLabel}</p>
      </footer>
    </main>
  );
}
