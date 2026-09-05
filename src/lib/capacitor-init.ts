'use client';

/**
 * Native-runtime bootstrap, invoked once from the root layout. No-ops
 * completely on the web (Capacitor.isNativePlatform() === false), so this
 * file is safe to import in both the Vercel web build and the Capacitor
 * Android build.
 */
export async function initCapacitor(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0B0B0F' });
  } catch {
    // @capacitor/* packages are only present in the Android build context;
    // failing to load them on web is expected and harmless.
  }
}
