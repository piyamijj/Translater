import { getLanguageByCode } from './languages';

/**
 * Text-to-speech via the browser's built-in Web Speech API (SpeechSynthesis) —
 * free, works fully offline/client-side, no API key required. This backs both
 * (i) automatic playback of translated output and (ii) the manual "read aloud"
 * buttons on each transcript panel. A server-side alternative (higher quality
 * neural voices via OpenAI TTS) is available through /api/tts for deployments
 * that configure OPENAI_API_KEY.
 */

let currentUtterance: SpeechSynthesisUtterance | null = null;

// Echo guard: the microphone must never listen to the app's own TTS output.
// `ttsActiveUntil` covers the utterance plus a short tail for room reverb.
let ttsActiveUntil = 0;
const TTS_TAIL_MS = 900;

export function isTtsActive(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.speechSynthesis?.speaking) || Date.now() < ttsActiveUntil;
}

export function speak(text: string, languageCode: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text.trim()) return;

  window.speechSynthesis.cancel(); // stop any in-flight utterance first
  const lang = getLanguageByCode(languageCode);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang.speechLang;
  utterance.rate = 1.02;
  utterance.pitch = 1;

  const voices = window.speechSynthesis.getVoices();
  const match = voices.find((v) => v.lang === lang.speechLang) ??
    voices.find((v) => v.lang.startsWith(lang.code));
  if (match) utterance.voice = match;

  // Mark busy immediately (onstart can lag), refresh on start/end.
  ttsActiveUntil = Date.now() + Math.min(30_000, 1500 + text.length * 110);
  utterance.onstart = () => { ttsActiveUntil = Date.now() + Math.min(30_000, 1500 + text.length * 110); };
  utterance.onend = () => { ttsActiveUntil = Date.now() + TTS_TAIL_MS; };
  utterance.onerror = () => { ttsActiveUntil = Date.now() + TTS_TAIL_MS; };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  ttsActiveUntil = Date.now() + 300;
  currentUtterance = null;
}

export function isSpeaking(): boolean {
  return typeof window !== 'undefined' && window.speechSynthesis?.speaking;
}
