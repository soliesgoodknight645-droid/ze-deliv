import Script from "next/script";

// UTMify — tracking de UTMs e Pixel Google Ads
//
// 1. utm.js (sempre carrega): captura utm_source/medium/campaign/content/term + gclid + fbclid
//    e injeta nos forms/links. Tambem salva em cookies pra UTMify casar com o pedido.
//
// 2. pixel-google.js (so se NEXT_PUBLIC_UTMIFY_GOOGLE_PIXEL_ID estiver setado):
//    dispara eventos de PageView/Conversao pro Google Ads via UTMify.
//
// 3. pixel.js (so se NEXT_PUBLIC_UTMIFY_PIXEL_ID estiver setado):
//    pixel proprio da UTMify (eventos de checkout/conversao).

export function UtmifyScripts() {
  const googlePixelId = process.env.NEXT_PUBLIC_UTMIFY_GOOGLE_PIXEL_ID;
  const pixelId = process.env.NEXT_PUBLIC_UTMIFY_PIXEL_ID;

  return (
    <>
      {/* Captura de UTMs (sempre) */}
      <Script
        id="utmify-utms"
        src="https://cdn.utmify.com.br/scripts/utms/utm.js"
        strategy="afterInteractive"
        data-utmify-prevent-xcod-sck=""
        data-utmify-prevent-subids=""
      />

      {/* Pixel proprio da UTMify (opcional) */}
      {pixelId ? (
        <Script id="utmify-pixel-id" strategy="afterInteractive">
          {`window.pixelId = ${JSON.stringify(pixelId)};`}
        </Script>
      ) : null}
      {pixelId ? (
        <Script
          id="utmify-pixel"
          src="https://cdn.utmify.com.br/scripts/pixel/pixel.js"
          strategy="afterInteractive"
        />
      ) : null}

      {/* Pixel do Google Ads via UTMify (opcional) */}
      {googlePixelId ? (
        <Script id="utmify-google-pixel-id" strategy="afterInteractive">
          {`window.googlePixelId = ${JSON.stringify(googlePixelId)};`}
        </Script>
      ) : null}
      {googlePixelId ? (
        <Script
          id="utmify-google-pixel"
          src="https://cdn.utmify.com.br/scripts/pixel/pixel-google.js"
          strategy="afterInteractive"
        />
      ) : null}
    </>
  );
}
