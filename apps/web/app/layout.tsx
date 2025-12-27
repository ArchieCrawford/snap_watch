import type { ReactNode } from "react";
import "./globals.css";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import Link from "next/link";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata = {
  title: "SnapSearch",
  description: "Causality-powered Farcaster search",
};

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="min-h-screen bg-radial-fade">
          <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
            <Link href="/" className="text-2xl font-semibold text-ink">
              SnapSearch
            </Link>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/50">
              Causality Engine
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl px-6 pb-20">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
};

export default RootLayout;
