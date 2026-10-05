import type { Metadata, Viewport } from "next";
import { Red_Hat_Mono, Red_Hat_Text } from "next/font/google";
import Script from "next/script";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import "./globals.css";

// next/font downloads these at build time and serves them from the app: no runtime font requests.
// One superfamily sized for dense UI text: Red Hat Text for words, Red Hat Mono for code and numbers.
const text = Red_Hat_Text({
  subsets: ["latin"],
  variable: "--font-red-hat-text",
  style: ["normal", "italic"],
});
const mono = Red_Hat_Mono({ subsets: ["latin"], variable: "--font-red-hat-mono" });

export const metadata: Metadata = {
  title: { default: "Lumi", template: "%s · Lumi" },
  description: "The review layer for work done by AI agents.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f0e0c" },
    { media: "(prefers-color-scheme: light)", color: "#f3efe6" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${text.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen">
        {/* Apply a saved theme before the page hydrates, to avoid a flash. */}
        <Script id="lumi-theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("lumi-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`}
        </Script>
        <KeyboardShortcuts />
        {children}
      </body>
    </html>
  );
}
