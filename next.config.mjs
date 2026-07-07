/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Otimizador da Vercel DESLIGADO: o plano gratuito estourou a cota de
    // otimizacao (erro 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED em todo
    // /_next/image), o que derrubou TODAS as fotos do site em producao.
    // Com unoptimized, o next/image vira <img> direto pro src — nossas fotos
    // ja vem do proxy /api/imagem-storage (cache de 1 ano) ou de CDNs
    // externos, entao a perda eh so o resize/webp automatico.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**.tabacariadamata.com.br" },
      { protocol: "https", hostname: "i.ibb.co" },
      { protocol: "https", hostname: "i.ibb.co.com" },
      { protocol: "https", hostname: "http2.mlstatic.com" },
      { protocol: "https", hostname: "images.multipedidos.com.br" },
      { protocol: "https", hostname: "**.zecheguei24h.com" },
      { protocol: "https", hostname: "**" },
    ],
  },
  // A pagina institucional vive em /gaseagua, mas como a categoria se chama
  // "Água e Gás" eh natural digitar /aguaegas. Redireciona as variacoes mais
  // comuns pra rota canonica, pra ninguem cair em 404.
  async redirects() {
    return [
      { source: "/aguaegas", destination: "/gaseagua", permanent: true },
      { source: "/agua-e-gas", destination: "/gaseagua", permanent: true },
      { source: "/gas-e-agua", destination: "/gaseagua", permanent: true },
      { source: "/agua", destination: "/gaseagua", permanent: false },
    ];
  },
};

export default nextConfig;
