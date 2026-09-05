# PolyGlot Live AI

Üretime hazır, ultra düşük gecikmeli, gerçek zamanlı sesli çeviri uygulaması —
herhangi bir kaynak dilde konuşmayı yakalar, esnek bir AI altyapısıyla
(Google Gemini, Groq veya OpenAI) anında yazıya döküp çevirir ve çeviriyi
sesli olarak geri okur. Tek bir Next.js kod tabanından hem **web
uygulaması (Vercel)** hem de **native Android uygulaması (Capacitor)**
olarak yayınlanır.

## Özellikler

- **Kendi API anahtarınızı kullanın (BYOK)**: Kullanıcılar kendi Gemini /
  Groq / OpenAI API anahtarlarını Ayarlar penceresine yapıştırır. Anahtarlar
  yalnızca tarayıcının `localStorage`'ında saklanır — hiçbir zaman
  kaydedilmez, sağlayıcının kendi API'si dışında hiçbir yere gönderilmez.
- **İki kayıt modu**: bas-konuş (push-to-talk) ve konuşma duraklamalarında
  otomatik çeviren, ses etkinliği algılamalı (VAD) eller serbest sürekli
  dinleme modu.
- **Otomatik sağlayıcı yedeklemesi**: tercih edilen sağlayıcı başarısız
  olursa, uygulama şeffaf biçimde yapılandırılmış başka bir sağlayıcıya
  geçer.
- **Tamamen sesli çeviri**: her çeviri sonucu otomatik olarak sesli okunur;
  hem orijinal hem çevrilmiş metin panelinde ayrı birer sesli okuma
  düğmesi bulunur.
- **Modern, mobil öncelikli, koyu temalı arayüz** ve canlı ses dalga formu
  görselleştiricisi.
- **15 hedef dil**, varsayılan olarak Türkçe, istediğiniz zaman
  değiştirilebilir.

## Teknoloji yığını

Next.js 14 (App Router, TypeScript, Tailwind CSS) · Capacitor (Android) ·
Shadcn/Radix UI · Framer Motion · Lucide ikonlar · Zustand (kalıcı) ·
Web Audio API / MediaRecorder · `@google/genai` · `groq-sdk` · Web Speech API.

## Proje yapısı

```
├── .github/workflows/build-apk.yml   CI: Android APK'yı derler ve (etiketlerde) GitHub Releases'a yayınlar
├── android/                          Capacitor native projesi (ilk CI çalışmasında otomatik üretilir, bkz. android/README.md)
├── src/
│   ├── app/
│   │   ├── api/translate/route.ts    isteğe bağlı sunucu taraflı çeviri yedeği (yalnızca Vercel)
│   │   ├── api/tts/route.ts          isteğe bağlı sunucu taraflı TTS yedeği (yalnızca Vercel)
│   │   ├── layout.tsx / page.tsx     uygulama kabuğu + ana çevirmen ekranı
│   │   └── globals.css
│   ├── components/                   AudioVisualizer, LanguageSelector, SettingsModal, TranslationDisplay
│   ├── hooks/                        useAudioRecorder (kayıt + VAD), useTranslation (orkestrasyon)
│   └── lib/
│       ├── ai/                       gemini.ts, groq.ts, provider-factory.ts (+ satır içi openai)
│       ├── store.ts                  Zustand deposu, localStorage'a kalıcı
│       ├── languages.ts, tts.ts, capacitor-init.ts, utils.ts
├── capacitor.config.json
├── next.config.mjs                   çift hedefli derleme (Vercel sunucu vs. Capacitor statik dışa aktarım)
├── package.json
└── vercel.json
```

## Web için başlarken

```bash
npm install
npm run dev        # http://localhost:3000
```

Çeviriye başlamak için Ayarlar (dişli simgesi) penceresini açıp en az bir
sağlayıcı API anahtarı yapıştırın.

## Vercel'e dağıtım

Depo, sürekli dağıtım için Vercel'e bağlanmıştır: `main` dalına yapılan her
push otomatik olarak üretime dağıtılır. `GEMINI_API_KEY` / `GROQ_API_KEY` /
`OPENROUTER_API_KEY` yalnızca `/api/translate` ve `/api/tts` sunucu
rotaları için **isteğe bağlı bir yedek** olarak Vercel proje ortam
değişkenleri şeklinde tanımlanmıştır — son kullanıcılar için birincil ve
varsayılan yol tamamen istemci taraflıdır, kendi anahtarlarını kullanır ve
bu değişkenlere hiç dokunmaz.

## Android APK'yı derleme

`.github/workflows/build-apk.yml` iş akışı tarafından `main` dalına yapılan
her push'ta ve sürüm etiketlerinde (`vX.Y.Z`) otomatik olarak yürütülür;
etiket push'larında APK ayrıca GitHub Releases'a da yayınlanır. Native
projenin neden elle yazılmadığı ve yerelde nasıl derleneceği için
`android/README.md` dosyasına bakın.

**İmzalı bir release APK** üretmek için (varsayılan olarak debug imzalı bir
APK üretilir), depo sırlarına (Settings → Secrets and variables → Actions)
şunları ekleyin:

- `RELEASE_KEYSTORE_BASE64` — `.keystore`/`.jks` dosyanızın base64 hâli
- `RELEASE_KEYSTORE_PASSWORD`
- `RELEASE_KEY_ALIAS`
- `RELEASE_KEY_PASSWORD`

Bunlar tanımlı değilse CI, test/yan yükleme için sorunsuz çalışan debug
imzalı bir APK üretir.

## Güvenlik notları

- Ayarlar penceresine girilen API anahtarları yalnızca `localStorage`'da
  saklanır ve her sağlayıcıya **doğrudan istemci taraflı çağrılarla**
  gönderilir — bu uygulamanın hiçbir zaman bir arka uç veritabanı yoktur ve
  istek gövdelerini asla kaydetmez.
- İki `/api/*` rotası, CORS uç durumları için isteğe bağlı, durumsuz
  (stateless) birer geçiş noktasıdır; onlar da hiçbir şeyi kalıcı olarak
  saklamaz.
