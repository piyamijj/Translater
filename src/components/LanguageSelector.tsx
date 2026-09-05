'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LANGUAGES } from '@/lib/languages';
import { usePolyGlotStore } from '@/lib/store';
import { Languages } from 'lucide-react';

export function LanguageSelector() {
  const targetLanguage = usePolyGlotStore((s) => s.targetLanguage);
  const setTargetLanguage = usePolyGlotStore((s) => s.setTargetLanguage);

  return (
    <div className="flex items-center gap-2">
      <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Select value={targetLanguage} onValueChange={setTargetLanguage}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Target language" />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              <span className="mr-2">{lang.flag}</span>
              {lang.nativeLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
