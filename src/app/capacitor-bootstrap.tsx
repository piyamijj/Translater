'use client';

import { useEffect } from 'react';
import { initCapacitor } from '@/lib/capacitor-init';

/** Fires the native-runtime bootstrap once on mount; no-ops on the web. */
export function CapacitorBootstrap() {
  useEffect(() => {
    initCapacitor();
  }, []);
  return null;
}
