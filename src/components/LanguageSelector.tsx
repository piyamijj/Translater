'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePolyGlotStore } from '@/lib/store';
import { getSourceLanguageFor } from '@/lib/languages';
import { Mic } from 'lucide-react';

/**
 * Explicit "who is speaking" choice. The speech-recognition language is fixed
 * to the language you pick here (no auto-detect); the translation goes into
 * the other language.
 */
export function LanguageSelector() {
  const targetLanguage = usePolyGlotStore((s) => s.targetLanguage);
  const setTargetLanguage = usePolyGlotStore((s) => s.setTargetLanguage);
  const source = getSourceLanguageFor(targetLanguage).code; // 'fa' | 'tr'

  return (
    <div className="flex items-center gap-2">
      <Mic className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Select value={source} onValueChange={(v) => setTargetLanguage(v === 'fa' ? 'tr' : 'fa')}>
        <SelectTrigger className="w-[210px]" aria-label="Konuşma dili">
          <SelectValue placeholder="Konuşma dili" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="fa">🇮🇷 Farsça konuşuyorum → Türkçe</SelectItem>
          <SelectItem value="tr">🇹🇷 Türkçe konuşuyorum → Farsça</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
