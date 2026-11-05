import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Public_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
});

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-public-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CustomCare — Smarter Support. Better Experiences.',
  description:
    'CustomCare helps businesses deliver faster, smarter customer support through intelligent assistance, organized knowledge and seamless human handoff.',
  icons: {
    icon: [
      {
        url: '/assets/aistudio/Black_White_Minimalist_Simple_Modern_Bold_Letter_Q_Atelier_Logo_20261104_000821_1_12ad5e9f.png',
        type: 'image/png',
      },
      { url: '/favicon.png', type: 'image/png' },
    ],
    shortcut: '/favicon.png',
    apple:
      '/assets/aistudio/Black_White_Minimalist_Simple_Modern_Bold_Letter_Q_Atelier_Logo_20261104_000821_1_12ad5e9f.png',
  },
  openGraph: {
    title: 'CustomCare — Smarter Support. Better Experiences.',
    description:
      'CustomCare helps businesses deliver faster, smarter customer support through intelligent assistance, organized knowledge and seamless human handoff.',
    type: 'website',
    images: [
      {
        url: '/assets/aistudio/Black_White_Minimalist_Simple_Modern_Bold_Letter_Q_Atelier_Logo_20261104_000639_0000_84dc5aab.png',
        width: 1200,
        height: 1200,
        alt: '.CUSTOMCARE — Smarter Support. Better Experiences.',
      },
    ],
  },
};

const STREAM_GUARD_SCRIPT = `(function(){
  if (typeof WritableStreamDefaultWriter !== 'undefined') {
    var origWrite = WritableStreamDefaultWriter.prototype.write;
    var origClose = WritableStreamDefaultWriter.prototype.close;
    WritableStreamDefaultWriter.prototype.write = function(chunk) {
      try {
        if (this.desiredSize === null) return Promise.resolve();
        return origWrite.call(this, chunk).catch(function(err) {
          if (err && String(err.message || err).indexOf('CLOSED writable stream') !== -1) {
            return;
          }
          throw err;
        });
      } catch (err) {
        if (err && String(err.message || err).indexOf('CLOSED writable stream') !== -1) {
          return Promise.resolve();
        }
        return Promise.reject(err);
      }
    };
    WritableStreamDefaultWriter.prototype.close = function() {
      try {
        if (this.desiredSize === null) return Promise.resolve();
        return origClose.call(this).catch(function(err) {
          if (err && String(err.message || err).indexOf('CLOSED writable stream') !== -1) {
            return;
          }
          throw err;
        });
      } catch (err) {
        if (err && String(err.message || err).indexOf('CLOSED writable stream') !== -1) {
          return Promise.resolve();
        }
        return Promise.reject(err);
      }
    };
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${publicSans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: STREAM_GUARD_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
