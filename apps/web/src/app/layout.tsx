import type { Metadata } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import Script from "next/script";

import "../index.css";
import Providers from "@/components/providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

// Noto Sans JP は日本語フォントファイルが大きく、subset プリロードもしないため
// preload: false にする。Google Fonts が unicode-range 付き @font-face を発行し、
// 必要な日本語グリフだけブラウザがオンデマンドで取得する。
const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://liveboard.linto-dev.workers.dev"),
  title: {
    default: "liveboard",
    template: "%s | liveboard",
  },
  description: "liveboard",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: "https://liveboard.linto-dev.workers.dev",
    siteName: "liveboard",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* Prevent dark mode flash: applies theme class before CSS renders.
            Mirrors next-themes internal logic (attribute="class", storageKey="theme",
            defaultTheme="system", enableSystem=true, enableColorScheme=true). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement,t=localStorage.getItem("theme")||"system",r=t==="system"?(window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"):t;d.classList.remove("light","dark");d.classList.add(r);d.style.colorScheme=r}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${notoSansJP.variable}`}>
        <Script id="bfcache-reload" strategy="beforeInteractive">
          {`(function(){var n=performance.getEntriesByType("navigation")[0];if(n&&n.type==="back_forward"){location.reload()}})()`}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
