export interface LanguageOption {
  code: 'tr' | 'fa';
  label: string;
  nativeLabel: string;
  flag: string;
  /** BCP-47 tag used for speech synthesis / recognition hints */
  speechLang: string;
  /** Text direction of the script */
  dir: 'ltr' | 'rtl';
}

/**
 * PolyGlot Live AI is a dedicated Persian <-> Turkish interpreter.
 * There is NO language auto-detection: the user picks the TARGET language and
 * the source is implied by it — target Persian => speaker speaks Turkish,
 * target Turkish => speaker speaks Persian.
 */
export const LANGUAGES: LanguageOption[] = [
  { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe', flag: '🇹🇷', speechLang: 'tr-TR', dir: 'ltr' },
  { code: 'fa', label: 'Persian', nativeLabel: 'فارسی', flag: '🇮🇷', speechLang: 'fa-IR', dir: 'rtl' },
];

export const DEFAULT_TARGET_LANGUAGE: LanguageOption['code'] = 'tr';

/** Coerces any stored/received value (e.g. an old 'en' from localStorage) to tr|fa. */
export function normalizeLanguageCode(code: string | null | undefined): LanguageOption['code'] {
  return code === 'fa' ? 'fa' : 'tr';
}

export function getLanguageByCode(code: string | null | undefined): LanguageOption {
  const c = normalizeLanguageCode(code);
  return LANGUAGES.find((l) => l.code === c) ?? LANGUAGES[0];
}

/** The language the speaker is assumed to speak, given the chosen target. */
export function getSourceLanguageFor(targetCode: string | null | undefined): LanguageOption {
  return normalizeLanguageCode(targetCode) === 'fa' ? getLanguageByCode('tr') : getLanguageByCode('fa');
}
