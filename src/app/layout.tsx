import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CapacitorBootstrap } from './capacitor-bootstrap';

export const metadata: Metadata = {
  title: 'PolyGlot Live AI',
  description: 'Kendi AI anahtarlarınızla çalışan, ultra düşük gecikmeli gerçek zamanlı sesli çeviri.',
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
    <html lang="tr" className="dark">
      <body className="min-h-screen antialiased">
        <CapacitorBootstrap />
        {children}
      </body>
    </html>
  );
}
