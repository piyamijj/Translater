export interface LanguageOption {
  code: string; // BCP-47
  label: string;
  nativeLabel: string;
  flag: string;
  // Web Speech API SpeechSynthesisVoice lang match hint
  speechLang: string;
}

/**
 * Target languages the user can translate INTO. Turkish (tr-TR) is the
 * default per spec; the rest cover the explicitly requested set plus a few
 * common extras. Source language is auto-detected by the AI provider, so
 * there is no source-language list — only "Auto-detect" is shown for source.
 */
export const LANGUAGES: LanguageOption[] = [
  { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe', flag: '🇹🇷', speechLang: 'tr-TR' },
  { code: 'en', label: 'English', nativeLabel: 'English', flag: '🇬🇧', speechLang: 'en-US' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch', flag: '🇩🇪', speechLang: 'de-DE' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español', flag: '🇪🇸', speechLang: 'es-ES' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', flag: '🇸🇦', speechLang: 'ar-SA' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский', flag: '🇷🇺', speechLang: 'ru-RU' },
  { code: 'fr', label: 'French', nativeLabel: 'Français', flag: '🇫🇷', speechLang: 'fr-FR' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano', flag: '🇮🇹', speechLang: 'it-IT' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português', flag: '🇵🇹', speechLang: 'pt-PT' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語', flag: '🇯🇵', speechLang: 'ja-JP' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어', flag: '🇰🇷', speechLang: 'ko-KR' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文', flag: '🇨🇳', speechLang: 'zh-CN' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', flag: '🇮🇳', speechLang: 'hi-IN' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands', flag: '🇳🇱', speechLang: 'nl-NL' },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski', flag: '🇵🇱', speechLang: 'pl-PL' },
];

export const DEFAULT_TARGET_LANGUAGE = 'tr';

export function getLanguageByCode(code: string): LanguageOption {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
