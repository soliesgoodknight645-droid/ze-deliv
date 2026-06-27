import type { Metadata } from "next";
import { Clock, Flame, Droplets, ShieldCheck, Truck } from "lucide-react";
import { Header } from "@/components/Header";
import { FooterGasAgua } from "@/components/FooterGasAgua";
import { ProductCard } from "@/components/ProductCard";
import { listarProdutos } from "@/lib/data";
import type { Produto } from "@/lib/types";

// Pagina institucional vertical "gas & agua"
// -----------------------------------------------------------------------------
// Foco: SO botijoes de gas e agua mineral. Nenhuma referencia a bebida alcoolica
// ou tabaco — por isso o AgeGate eh desativado nessa rota (ver AgeGate.tsx,
// constante ROTAS_SEM_AGE_GATE).
// O catalogo eh o mesmo do site principal (Supabase), mas filtrado em runtime
// pra mostrar so as duas categorias relevantes.

export const metadata: Metadata = {
  title: "Gás e Água — Zé Express | Entrega rápida em Palmeira dos Índios",
  description:
    "Botijão de gás (P5 e P13) e água mineral com entrega rápida. Sem assinatura, sem complicação. Peça pelo Zé Express.",
  alternates: { canonical: "/gaseagua" },
  openGraph: {
    title: "Gás e Água — Zé Express",
    description:
      "Botijão de gás (P5 e P13) e água mineral com entrega rápida em Palmeira dos Índios/AL.",
    type: "website",
  },
  // Como nao tem nada de alcool aqui, deixamos crawlers indexarem normalmente.
  robots: { index: true, follow: true },
};

export const revalidate = 300;

const SLUG_GAS_E_AGUA = "agua-e-gas";
const SLUG_AGUAS_E_GELO = "aguas-e-gelo";

// Heuristica de filtro pra `aguas-e-gelo`:
// - Pegar so itens que tenham "agua" no slug E NAO sejam de "gelo", "coco" ou
//   sabores frutados (morango, melancia, etc.) — essas variacoes sao mais
//   ligadas ao publico de bebidas, fora do escopo institucional.
const PALAVRAS_EXCLUIR_AGUA = [
  "gelo",
  "coco",
  "morango",
  "melancia",
  "maca-verde",
  "maca",
  "maracuja",
  "limao",
  "laranja",
  "beats",
  "embalagem",
];

function ehAguaMineral(produto: Produto): boolean {
  const slug = produto.slug.toLowerCase();
  if (!slug.startsWith("agua-")) return false;
  if (PALAVRAS_EXCLUIR_AGUA.some((p) => slug.includes(p))) return false;
  return true;
}

function ehGas(produto: Produto): boolean {
  const slug = produto.slug.toLowerCase();
  return slug.startsWith("botijao-") || slug.includes("-gas-");
}

export default async function GasEAguaPage() {
  const produtos = await listarProdutos();

  const daCategoriaGasEAgua = produtos.filter(
    (p) => p.category?.slug === SLUG_GAS_E_AGUA && p.inStock !== false,
  );
  const aguaCategoriaAguasGelo = produtos.filter(
    (p) =>
      p.category?.slug === SLUG_AGUAS_E_GELO &&
      ehAguaMineral(p) &&
      p.inStock !== false,
  );

  const botijoes = daCategoriaGasEAgua
    .filter(ehGas)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const aguas = [
    ...daCategoriaGasEAgua.filter((p) => !ehGas(p)),
    ...aguaCategoriaAguasGelo,
  ].sort((a, b) => {
    // ordenar pelos garrafoes grandes (20L) primeiro, depois packs, depois individuais
    const tamanho = (p: Produto) => {
      const s = p.slug;
      if (/20l|10l/.test(s)) return 0;
      if (/pack-com/.test(s)) return 1;
      if (/5l/.test(s)) return 2;
      return 3;
    };
    const ta = tamanho(a);
    const tb = tamanho(b);
    if (ta !== tb) return ta - tb;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  return (
    <>
      <Header />
      <main className="flex-1 pb-24">
        {/* HERO institucional */}
        <section className="relative overflow-hidden bg-gradient-to-br from-brand-yellow to-amber-400">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/15 blur-2xl" />
          <div className="absolute -bottom-16 -left-12 w-56 h-56 rounded-full bg-brand-dark/10 blur-2xl" />
          <div className="relative px-5 pt-7 pb-8 max-w-screen-md mx-auto">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider bg-brand-dark text-brand-yellow rounded-full px-2.5 py-1">
              <Clock className="w-3 h-3" /> Entrega em até 30 min
            </span>
            <h1 className="mt-3 font-display font-extrabold text-3xl leading-tight text-brand-dark">
              Gás e água na sua porta,
              <br />
              sem complicação.
            </h1>
            <p className="mt-2 text-sm text-brand-dark/80 leading-relaxed max-w-md">
              Botijão de gás (P5 e P13) e água mineral entregues por
              distribuidoras parceiras em Palmeira dos Índios/AL. Sem
              assinatura, sem mensalidade — pediu, chegou.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <a
                href="#gas"
                className="h-11 rounded-full font-bold text-sm bg-brand-dark text-brand-yellow active:scale-95 transition-transform flex items-center justify-center gap-1.5"
              >
                <Flame className="w-4 h-4" /> Pedir gás
              </a>
              <a
                href="#agua"
                className="h-11 rounded-full font-bold text-sm bg-white text-brand-dark active:scale-95 transition-transform flex items-center justify-center gap-1.5"
              >
                <Droplets className="w-4 h-4" /> Pedir água
              </a>
            </div>
          </div>
        </section>

        {/* DIFERENCIAIS */}
        <section className="px-4 py-5 max-w-screen-md mx-auto">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-gray-100 bg-white p-3 text-center">
              <Truck className="w-5 h-5 mx-auto text-brand-yellow mb-1" />
              <p className="text-[11px] font-semibold text-brand-dark leading-tight">
                Frete <br /> rápido
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-3 text-center">
              <ShieldCheck className="w-5 h-5 mx-auto text-brand-yellow mb-1" />
              <p className="text-[11px] font-semibold text-brand-dark leading-tight">
                Marcas <br /> oficiais
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-3 text-center">
              <Clock className="w-5 h-5 mx-auto text-brand-yellow mb-1" />
              <p className="text-[11px] font-semibold text-brand-dark leading-tight">
                Aberto <br /> 24h
              </p>
            </div>
          </div>
        </section>

        {/* GAS */}
        <section id="gas" className="px-4 py-5 max-w-screen-md mx-auto scroll-mt-16">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-brand-red/10 flex items-center justify-center">
                <Flame className="w-5 h-5 text-brand-red" />
              </span>
              <div>
                <h2 className="font-display font-extrabold text-lg text-brand-dark leading-tight">
                  Gás de cozinha
                </h2>
                <p className="text-xs text-gray-500">
                  Botijões P5 e P13 das principais marcas
                </p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-gray-400">
              {botijoes.length} itens
            </span>
          </div>

          {botijoes.length === 0 ? (
            <EmptyState mensagem="Nenhum botijão disponível no momento." />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {botijoes.map((p, i) => (
                <ProductCard key={p.id} produto={p} prioridade={i < 2} />
              ))}
            </div>
          )}
        </section>

        {/* AGUA */}
        <section id="agua" className="px-4 py-5 bg-brand-gray scroll-mt-16">
          <div className="max-w-screen-md mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Droplets className="w-5 h-5 text-blue-500" />
                </span>
                <div>
                  <h2 className="font-display font-extrabold text-lg text-brand-dark leading-tight">
                    Água mineral
                  </h2>
                  <p className="text-xs text-gray-500">
                    Garrafões 20L, packs e garrafas individuais
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-gray-400">
                {aguas.length} itens
              </span>
            </div>

            {aguas.length === 0 ? (
              <EmptyState mensagem="Nenhuma água disponível no momento." />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {aguas.map((p) => (
                  <ProductCard key={p.id} produto={p} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* CTA / SOBRE */}
        <section className="px-4 py-6 max-w-screen-md mx-auto">
          <div className="rounded-2xl bg-brand-dark p-5 text-center">
            <p className="text-2xl mb-1">🚚</p>
            <h3 className="font-bold text-white text-base mb-1">
              Sem assinatura, sem fidelidade
            </h3>
            <p className="text-gray-400 text-xs leading-relaxed mb-4">
              Você pede só quando precisa, paga pelo PIX e a distribuidora
              parceira entrega na sua porta. Simples assim.
            </p>
            <a
              href="#gas"
              className="inline-flex h-11 px-6 rounded-full font-bold text-sm bg-brand-yellow text-brand-dark active:scale-95 transition-transform items-center"
            >
              Fazer meu pedido
            </a>
          </div>
        </section>
      </main>
      <FooterGasAgua />
    </>
  );
}

function EmptyState({ mensagem }: { mensagem: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white py-8 px-4 text-center">
      <p className="text-sm text-gray-500">{mensagem}</p>
    </div>
  );
}
