import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'uVOiZ – AI Telecaller Platform for BPOs',
  description: 'Replace telecallers with AI. Automate outbound calls in Hindi, Tamil, English and more.',
  icons: {
    icon: '/images/fav-icon.webp',
    shortcut: '/images/fav-icon.webp',
    apple: '/images/fav-icon.webp',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
