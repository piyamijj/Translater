import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CapacitorBootstrap } from './capacitor-bootstrap';

export const metadata: Metadata = {
  title: 'PolyGlot Live AI',
  description: 'Ultra-low-latency real-time voice translation, powered by your own AI keys.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0B0B0F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <CapacitorBootstrap />
        {children}
      </body>
    </html>
  );
}
