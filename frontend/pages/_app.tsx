import React from 'react';
import type { AppProps } from 'next/app';
import { JetBrains_Mono, Syne } from 'next/font/google';
import Navbar from '../components/Navbar';
import '../styles/globals.css';

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  weight: ['400', '500', '600', '700'],
});

function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${syne.variable} ${jetbrainsMono.variable} min-h-screen bg-[#050A0E] text-[#E8F4F8] [font-family:var(--font-jetbrains)]`}>
      <Navbar />
      <Component {...pageProps} />
    </div>
  );
}

export default App;
