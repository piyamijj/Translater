/**
 * Next.js config with a dual-target build:
 *  - Vercel (default): standard Next.js server build, keeps /api/* serverless routes alive.
 *  - Capacitor (BUILD_TARGET=capacitor): static export (`output: "export"`) so the app can be
 *    bundled as static HTML/JS/CSS into the Android WebView via Capacitor. Static export cannot
 *    serve API routes, which is why every AI call is designed to run client-side by default
 *    (see src/lib/ai/*) — the /api/translate and /api/tts routes are an optional server-side
 *    fallback that only exists in the Vercel build.
 */
const isCapacitorBuild = process.env.BUILD_TARGET === 'capacitor';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isCapacitorBuild
    ? {
        output: 'export',
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
