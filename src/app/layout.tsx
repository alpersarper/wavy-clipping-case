import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";

import { AppNav } from "@/components/app-nav";
import { UserSwitcher } from "@/components/user-switcher";
import { TRPCProvider } from "@/trpc/client";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Wavy Clipping",
  description: "Paid clipping campaigns: submit clips, review them, pay per 1k views.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <TRPCProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-3 focus:ring-ring/50"
          >
            Skip to main content
          </a>
          <header className="border-b">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
              <Link href="/" className="font-semibold">
                Wavy Clipping
              </Link>
              <AppNav />
              <div className="ml-auto">
                <UserSwitcher />
              </div>
            </div>
          </header>
          <main id="main" className="mx-auto max-w-5xl px-4 py-8">
            {children}
          </main>
        </TRPCProvider>
      </body>
    </html>
  );
}
