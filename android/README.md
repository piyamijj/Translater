# android/ — Capacitor native projesi

Bu dizin bilerek elle yazılmamıştır. Bir Capacitor Android projesi (Gradle
wrapper, `AndroidManifest.xml`, `MainActivity`, kaynak klasörleri vb.),
`package.json` içindeki tam `@capacitor/core` / `@capacitor/android`
sürümlerine karşı gerçek Capacitor CLI'si (`npx cap add android`)
tarafından üretilmelidir — elle yazmak, kurulu Capacitor sürümünden sessizce
sapan, bozuk/derlenemez bir projeye yol açma riski taşır.

`build-apk` GitHub Actions iş akışı (`.github/workflows/build-apk.yml`) bunu
otomatik ve tekrar çalıştırılabilir (idempotent) şekilde halleder:

1. Her çalışmada, eğer `android/app` henüz yoksa, o anda kurulu Capacitor
   sürümü için sıfırdan doğru bir native proje üretmek üzere
   `npx cap add android` komutunu çalıştırır, ardından bunu depoya geri
   commit'ler — böylece o andan itibaren proje yapısının istediği gibi,
   normal ve versiyon kontrollü bir parça hâline gelir.
2. Ardından en güncel statik web derlemesini (`out/`) native projeye
   kopyalamak ve Capacitor eklentilerini senkronize etmek için
   `npx cap sync android` çalıştırır.
3. Son olarak APK'yı Gradle ile derler ve GitHub Releases'a yayınlar.

Native projeyi yerelde incelemek veya özelleştirmek isterseniz:

```bash
npm install
npm run build:capacitor
npx cap add android   # yalnızca android/app henüz yoksa
npx cap sync android
npx cap open android   # Android Studio'yu açar
```
