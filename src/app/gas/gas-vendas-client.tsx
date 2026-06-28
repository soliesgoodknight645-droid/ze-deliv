"use client";

import { useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
  Clock,
  CreditCard,
  Droplets,
  Flame,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Star,
  Truck,
  Zap,
} from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { ProductCard } from "@/components/ProductCard";
import { SafeProductImage } from "@/components/SafeProductImage";
import { imagemProduto } from "@/lib/imagens";
import { calcDesconto, fmtPreco, precoFinal, MINUTOS_ENTREGA } from "@/lib/utils";
import { LIMITE_FRETE_GRATIS, TAXA_FRETE_REAIS } from "@/lib/frete";
import type { Produto } from "@/lib/types";

type Props = {
  heroGas: Produto | null;
  botijoesP13: Produto[];
  outrosGas: Produto[];
  aguas: Produto[];
};

// Prova social — números/depoimentos ilustrativos. Edite à vontade conforme
// os dados reais da operação (avaliações, total de entregas, etc.).
const NOTA = "4,9";
const TOTAL_AVALIACOES = "2.300+";
const TOTAL_ENTREGAS = "12 mil+";

const DEPOIMENTOS = [
  {
    nome: "Marina S.",
    texto: "Pedi 21h num domingo achando que não ia chegar. Em 25 min o gás tava aqui. Salvou o jantar!",
  },
  {
    nome: "Cláudio R.",
    texto: "Preço justo e o entregador já trouxe o cheio e levou o vazio. Bem prático, virei cliente.",
  },
  {
    nome: "Dona Lúcia",
    texto: "Paguei no PIX na hora, super tranquilo. Atendimento educado e rápido.",
  },
];

const FAQ = [
  {
    p: `Em quanto tempo o gás chega?`,
    r: `Na maioria das regiões de Palmeira dos Índios entregamos em até ${MINUTOS_ENTREGA} minutos. Atendemos todos os dias, 24h.`,
  },
  {
    p: `Quanto custa a entrega?`,
    r: `Frete grátis em pedidos a partir de ${fmtPreco(
      LIMITE_FRETE_GRATIS,
    )}. Abaixo disso, taxa única de ${fmtPreco(TAXA_FRETE_REAIS)}.`,
  },
  {
    p: `Preciso devolver o botijão vazio?`,
    r: `Sim. O preço anunciado é da troca (recarga): o entregador leva o botijão cheio e retira o seu vazio no mesmo momento. Não inclui a compra do vasilhame novo.`,
  },
  {
    p: `Como posso pagar?`,
    r: `No PIX na hora do pedido (confirmação na hora) ou na entrega. Rápido e sem complicação.`,
  },
  {
    p: `Vocês atendem minha região?`,
    r: `Atendemos Palmeira dos Índios/AL e arredores. Ao finalizar o pedido confirmamos o endereço de entrega.`,
  },
];

export function GasVendasClient({ heroGas, botijoesP13, outrosGas, aguas }: Props) {
  const { adicionar, totalItens } = useCart();
  const [faqAberto, setFaqAberto] = useState<number | null>(0);

  const heroPreco = heroGas ? precoFinal(heroGas.price, heroGas.promoPrice) : 0;
  const heroDesc = heroGas ? calcDesconto(heroGas.price, heroGas.promoPrice) : 0;

  const pedirHero = () => {
    if (heroGas) adicionar(heroGas);
  };

  return (
    <main className="flex-1 pb-28">
      {/* ============== HERO ============== */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-dark via-gray-900 to-brand-dark">
        <div
          aria-hidden
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 15% 0%, rgba(254,205,16,0.35), transparent 45%), radial-gradient(circle at 90% 100%, rgba(239,68,68,0.25), transparent 45%)",
          }}
        />
        <div className="relative px-5 pt-6 pb-7 max-w-screen-md mx-auto">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-brand-yellow text-brand-dark rounded-full px-3 py-1">
            <Clock className="w-3.5 h-3.5" /> Entrega em até {MINUTOS_ENTREGA} min · 24h
          </span>

          <h1 className="mt-4 font-display font-extrabold text-[2rem] leading-[1.1] text-white">
            Acabou o gás?
            <br />
            <span className="text-brand-yellow">A gente leva agora.</span>
          </h1>
          <p className="mt-3 text-sm text-white/75 leading-relaxed max-w-md">
            Botijão P13 das melhores marcas na sua porta em minutos. Pague no
            PIX ou na entrega, sem sair de casa.
          </p>

          {/* estrelas / prova social inline */}
          <div className="mt-4 flex items-center gap-2 text-white/90">
            <div className="flex">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="w-4 h-4 fill-brand-yellow text-brand-yellow" />
              ))}
            </div>
            <span className="text-xs font-semibold">
              {NOTA} · {TOTAL_AVALIACOES} avaliações
            </span>
          </div>

          {/* Card do produto hero */}
          {heroGas ? (
            <div className="mt-5 bg-white rounded-2xl p-4 shadow-2xl">
              <div className="flex gap-4 items-center">
                <div className="relative w-24 h-24 flex-shrink-0 rounded-xl bg-gray-50 overflow-hidden">
                  <SafeProductImage
                    src={imagemProduto(heroGas)}
                    alt={heroGas.name}
                    fill
                    sizes="96px"
                    className="object-contain p-1.5"
                    priority
                  />
                  {heroDesc > 0 && (
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-white text-[10px] font-bold bg-brand-green">
                      -{heroDesc}%
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-brand-green">
                    Mais pedido
                  </p>
                  <h2 className="text-sm font-bold text-brand-dark leading-tight line-clamp-2">
                    {heroGas.name}
                  </h2>
                  <div className="mt-1 flex items-end gap-2">
                    {heroDesc > 0 && (
                      <span className="text-xs text-gray-400 line-through">
                        {fmtPreco(heroGas.price ?? 0)}
                      </span>
                    )}
                    <span className="text-2xl font-extrabold text-brand-dark leading-none">
                      {fmtPreco(heroPreco)}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={pedirHero}
                className="mt-4 w-full py-3.5 rounded-xl font-extrabold text-base bg-brand-yellow text-brand-dark active:scale-[0.98] transition-transform inline-flex items-center justify-center gap-2"
              >
                <Zap className="w-5 h-5" /> Pedir agora
              </button>
              <p className="mt-2 text-center text-[11px] text-gray-500">
                Pagamento no PIX ou na entrega · troca do vazio inclusa
              </p>
            </div>
          ) : (
            <div className="mt-5 bg-white rounded-2xl p-5 text-center">
              <p className="text-sm text-gray-500">
                Estamos sem botijão disponível no momento. Tente novamente em
                instantes.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ============== FAIXA DE CONFIANÇA ============== */}
      <section className="bg-brand-yellow">
        <div className="max-w-screen-md mx-auto px-4 py-3 grid grid-cols-3 gap-2 text-center text-brand-dark">
          <div className="flex flex-col items-center gap-0.5">
            <Truck className="w-5 h-5" />
            <span className="text-[11px] font-bold leading-tight">Entrega rápida</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <BadgeCheck className="w-5 h-5" />
            <span className="text-[11px] font-bold leading-tight">Marcas oficiais</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <CreditCard className="w-5 h-5" />
            <span className="text-[11px] font-bold leading-tight">PIX ou na entrega</span>
          </div>
        </div>
      </section>

      {/* ============== ESCOLHA A MARCA (P13) ============== */}
      <section className="px-4 py-6 max-w-screen-md mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Flame className="w-5 h-5 text-brand-red" />
          <h2 className="font-display font-extrabold text-xl text-brand-dark">
            Escolha sua marca
          </h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Botijão P13 (13kg) — mesma entrega rápida em todas.
        </p>

        {botijoesP13.length === 0 ? (
          <EmptyState mensagem="Nenhum botijão disponível agora." />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {botijoesP13.map((p, i) => (
              <ProductCard key={p.id} produto={p} prioridade={i < 2} />
            ))}
          </div>
        )}
      </section>

      {/* ============== PROVA SOCIAL ============== */}
      <section className="bg-brand-gray">
        <div className="max-w-screen-md mx-auto px-4 py-7">
          <div className="flex items-center justify-center gap-6 text-center mb-5">
            <div>
              <p className="text-3xl font-extrabold text-brand-dark leading-none">{NOTA}</p>
              <div className="flex justify-center mt-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-brand-yellow text-brand-yellow" />
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{TOTAL_AVALIACOES} avaliações</p>
            </div>
            <div className="w-px h-12 bg-gray-300" />
            <div>
              <p className="text-3xl font-extrabold text-brand-dark leading-none">
                {TOTAL_ENTREGAS}
              </p>
              <p className="text-[11px] text-gray-500 mt-1 max-w-[90px]">
                entregas realizadas
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {DEPOIMENTOS.map((d) => (
              <div key={d.nome} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold text-brand-dark">{d.nome}</span>
                  <div className="flex">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} className="w-3 h-3 fill-brand-yellow text-brand-yellow" />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{d.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============== COMPLEMENTO: P5 + ÁGUA ============== */}
      {(outrosGas.length > 0 || aguas.length > 0) && (
        <section className="px-4 py-6 max-w-screen-md mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <Droplets className="w-5 h-5 text-blue-500" />
            <h2 className="font-display font-extrabold text-xl text-brand-dark">
              Aproveite e leve junto
            </h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Botijão P5 e água mineral na mesma entrega.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[...outrosGas, ...aguas].map((p) => (
              <ProductCard key={p.id} produto={p} />
            ))}
          </div>
        </section>
      )}

      {/* ============== GARANTIAS / COMO FUNCIONA ============== */}
      <section className="px-4 py-2 max-w-screen-md mx-auto">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
          <Passo
            Icon={Zap}
            titulo="1. Faça o pedido"
            texto="Escolha o botijão, toque em pedir e confirme seu endereço."
          />
          <Passo
            Icon={RefreshCw}
            titulo="2. Troca na porta"
            texto="O entregador leva o cheio e retira o seu botijão vazio."
          />
          <Passo
            Icon={ShieldCheck}
            titulo="3. Pague com segurança"
            texto="PIX na hora ou pagamento na entrega. Você escolhe."
          />
        </div>
      </section>

      {/* ============== FAQ ============== */}
      <section className="px-4 py-6 max-w-screen-md mx-auto">
        <h2 className="font-display font-extrabold text-xl text-brand-dark mb-3">
          Perguntas frequentes
        </h2>
        <div className="space-y-2">
          {FAQ.map((item, i) => {
            const aberto = faqAberto === i;
            return (
              <div
                key={i}
                className="rounded-xl border border-gray-100 bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setFaqAberto(aberto ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left active:bg-gray-50"
                >
                  <span className="text-sm font-semibold text-brand-dark">{item.p}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
                      aberto ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {aberto && (
                  <p className="px-4 pb-3 text-sm text-gray-600 leading-relaxed">
                    {item.r}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ============== CTA FINAL ============== */}
      <section className="px-4 pb-8 max-w-screen-md mx-auto">
        <div className="rounded-2xl bg-brand-dark p-6 text-center">
          <Flame className="w-8 h-8 mx-auto text-brand-yellow mb-2" />
          <h3 className="font-display font-extrabold text-white text-lg mb-1">
            Seu gás chega ainda hoje
          </h3>
          <p className="text-gray-400 text-sm leading-relaxed mb-4">
            Entrega em até {MINUTOS_ENTREGA} minutos, todos os dias. Peça agora e
            resolva sem sair de casa.
          </p>
          {heroGas && (
            <button
              type="button"
              onClick={pedirHero}
              className="inline-flex h-12 px-7 rounded-full font-extrabold text-sm bg-brand-yellow text-brand-dark active:scale-95 transition-transform items-center gap-2"
            >
              <Zap className="w-4 h-4" /> Pedir meu gás · {fmtPreco(heroPreco)}
            </button>
          )}
          <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-gray-500">
            <MapPin className="w-3 h-3" /> Palmeira dos Índios/AL e região
          </p>
        </div>
      </section>

      {/* ============== STICKY CTA (só quando carrinho vazio) ============== */}
      {heroGas && totalItens === 0 && (
        <div className="fixed bottom-3 left-3 right-3 z-30 mx-auto max-w-md animate-slide-up">
          <button
            type="button"
            onClick={pedirHero}
            className="w-full bg-brand-yellow rounded-2xl shadow-2xl px-4 py-3 flex items-center justify-between gap-3 active:scale-[0.99] transition-transform"
          >
            <span className="flex items-center gap-2 text-brand-dark font-extrabold text-sm">
              <Zap className="w-5 h-5" /> Pedir gás agora
            </span>
            <span className="text-brand-dark font-extrabold text-base">
              {fmtPreco(heroPreco)}
            </span>
          </button>
        </div>
      )}
    </main>
  );
}

function Passo({
  Icon,
  titulo,
  texto,
}: {
  Icon: typeof Zap;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="w-10 h-10 rounded-full bg-brand-yellow/15 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-brand-dark" />
      </span>
      <div>
        <p className="text-sm font-bold text-brand-dark leading-tight">{titulo}</p>
        <p className="text-sm text-gray-500 leading-snug">{texto}</p>
      </div>
    </div>
  );
}

function EmptyState({ mensagem }: { mensagem: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white py-8 px-4 text-center">
      <p className="text-sm text-gray-500">{mensagem}</p>
    </div>
  );
}
