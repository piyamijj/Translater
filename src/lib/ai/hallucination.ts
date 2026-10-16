/**
 * Known STT "ghost" outputs: Whisper-style models invent stock phrases
 * (subtitle credits, "thanks for watching", ...) when fed silence or noise.
 * Anything matching is treated as "no speech".
 */
const GHOST_PATTERNS: RegExp[] = [
  /altyaz[ıi]/i,
  /izlediğiniz için/i,
  /izledi[gğ]iniz için/i,
  /abone ol/i,
  /videoyu be[gğ]en/i,
  /thanks? for watching/i,
  /thank you for watching/i,
  /subtitles? by/i,
  /amara\.org/i,
  /www\.\w+\.(com|org|net)/i,
  /زیرنویس/,
  /ترجمه[\s‌]*(شده)?[\s‌]*(توسط|از)/,
  /تماشا کردید/,
  /ممنون که (تماشا|دیدید)/,
  /^[\s.\-–—…,!?¿¡♪♫*]*$/,
];

export function isGhostTranscript(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t) return true;
  if (t.length < 2) return true;
  return GHOST_PATTERNS.some((re) => re.test(t));
}

/** Whisper verbose_json segment sanity: true if the segment looks like noise. */
export function isNoisySegment(seg: {
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
}): boolean {
  if ((seg.no_speech_prob ?? 0) > 0.6) return true;
  if ((seg.avg_logprob ?? 0) < -1.0) return true;
  if ((seg.compression_ratio ?? 0) > 2.4) return true;
  return false;
}

// Single-word stock outputs STT models emit for silence/noise/music
// (seen in real device logs: "موسیقی", "شکر میکنم", "umm").
const STOCK_SHORT = /^[\s.!?,…\-–—]*(موسیقی|موزیک|شکر[\s‌]*می[\s‌]*کنم|ممنون|متشکرم|مرسی|müzik|music|teşekkürler|teşekkür ederim|sağ ol|umm+|uhh*|hmm+|mm+|ah+|eh+|ha+)[\s.!?,…\-–—]*$/i;

/** True for degenerate repetition loops ("X ve X ve X ve X ..."). */
export function isRepetitionLoop(text: string): boolean {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 6) return false;
  for (let n = 1; n <= 4; n++) {
    let maxRun = 1;
    let run = 1;
    for (let i = n; i + n <= tokens.length; i += n) {
      const a = tokens.slice(i - n, i).join(' ');
      const b = tokens.slice(i, i + n).join(' ');
      if (a === b) {
        run++;
        if (run > maxRun) maxRun = run;
      } else {
        run = 1;
      }
    }
    if (maxRun >= 4) return true;
  }
  const uniq = new Set(tokens).size;
  return tokens.length >= 10 && uniq / tokens.length < 0.3;
}

export function isGhostText(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  return isGhostTranscript(t) || STOCK_SHORT.test(t) || isRepetitionLoop(t);
}
