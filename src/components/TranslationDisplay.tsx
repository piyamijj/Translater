'use client';

import { useState } from 'react';
import { Copy, Check, Volume2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { speak, stopSpeaking } from '@/lib/tts';
import { getLanguageByCode } from '@/lib/languages';
import type { TranscriptEntry } from '@/lib/store';
import { cn } from '@/lib/utils';

interface PanelProps {
  label: string;
  text: string;
  languageCode: string; // used for read-aloud voice selection
  emptyHint: string;
  accent?: 'default' | 'primary';
}

function Panel({ label, text, languageCode, emptyHint, accent = 'default' }: PanelProps) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const handleCopy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleReadAloud = () => {
    if (!text) return;
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    speak(text, languageCode);
    setSpeaking(true);
    // Best-effort: Web Speech API has no reliable universal "onend" across all
    // platforms, so we optimistically clear the speaking state shortly after
    // a duration proportional to text length.
    const estimatedMs = Math.min(20000, 800 + text.length * 55);
    setTimeout(() => setSpeaking(false), estimatedMs);
  };

  return (
    <div
      className={cn(
        'flex min-h-[160px] flex-col rounded-2xl border p-4',
        accent === 'primary'
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-card'
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!text}
            onClick={handleReadAloud}
            aria-label="Sesli oku"
          >
            {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!text}
            onClick={handleCopy}
            aria-label="Kopyala"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      <p
        className={cn(
          'flex-1 whitespace-pre-wrap break-words text-lg font-semibold leading-snug',
          !text && 'text-muted-foreground/60 font-normal'
        )}
      >
        {text || emptyHint}
      </p>
    </div>
  );
}

interface TranslationDisplayProps {
  entry: TranscriptEntry | undefined;
}

/**
 * Dual live text panels: original transcription (top) and translated output
 * (bottom), each with its own copy + read-aloud controls, per spec 2D.
 */
export function TranslationDisplay({ entry }: TranslationDisplayProps) {
  const targetLang = entry ? getLanguageByCode(entry.targetLang) : null;

  return (
    <div className="grid gap-3">
      <Panel
        label="Orijinal"
        text={entry?.sourceText ?? ''}
        languageCode={entry?.sourceLangGuess ?? 'en'}
        emptyHint="Konuşmanız burada görünecek…"
      />
      <Panel
        label={`Çeviri${targetLang ? ` · ${targetLang.nativeLabel}` : ''}`}
        text={entry?.translatedText ?? ''}
        languageCode={entry?.targetLang ?? 'tr'}
        emptyHint="Çeviri burada görünecek…"
        accent="primary"
      />
    </div>
  );
}
