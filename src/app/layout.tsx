import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { CartProvider } from "@/contexts/CartContext";
import { UpsellProvider } from "@/contexts/UpsellContext";
import { CartSheet } from "@/components/CartSheet";
import { FloatingCartBar } from "@/components/FloatingCartBar";
import { AgeGate } from "@/components/AgeGate";
import { UtmifyScripts } from "@/components/UtmifyScripts";
import "./globals.css";

const fontSans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const fontDisplay = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["700", "800"],
});

export const metadata: Metadata = {
  title: "Zé Chegou 24h — Marketplace de Bebidas com Entrega 24h",
  description:
    "Zé Chegou 24h é o marketplace de bebidas que conecta você à distribuidora mais próxima da sua região. Cervejas, destilados, vinhos e muito mais com entrega 24 horas.",
  icons: { icon: "/favicon.png", shortcut: "/favicon.png", apple: "/favicon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#FFD000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fontSans.variable} ${fontDisplay.variable}`}>
      <body className="font-sans bg-white text-brand-dark min-h-screen">
        <CartProvider>
          <UpsellProvider>
            <AgeGate />
            <div className="min-h-screen flex flex-col">{children}</div>
            <FloatingCartBar />
            <CartSheet />
            <Toaster position="top-center" richColors closeButton />
          </UpsellProvider>
        </CartProvider>
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "wjwwvnf403");`}
        </Script>
        <UtmifyScripts />
      </body>
    </html>
  );
}
