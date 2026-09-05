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

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
}

export function isSpeaking(): boolean {
  return typeof window !== 'undefined' && window.speechSynthesis?.speaking;
}
