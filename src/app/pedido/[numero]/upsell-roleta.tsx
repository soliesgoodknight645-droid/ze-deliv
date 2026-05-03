"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, Sparkles, X } from "lucide-react";
import { useUpsell, type DadosClienteUpsell } from "@/contexts/UpsellContext";

type Premio = {
  rotulo: string;
  cor: string;
  corTexto: string;
  emoji?: string;
};

// IMPORTANTE: a ordem dos premios determina onde a roleta para visualmente.
// Sempre cai no premio "50%" (indice 6).
const PREMIOS: Premio[] = [
  { rotulo: "R$ 10",  cor: "#FBBF24", corTexto: "#1F2937" },                   // 0
  { rotulo: "30%",    cor: "#EF4444", corTexto: "#FFFFFF" },                   // 1
  { rotulo: "R$ 50",  cor: "#10B981", corTexto: "#FFFFFF" },                   // 2
  { rotulo: "75%",    cor: "#3B82F6", corTexto: "#FFFFFF" },                   // 3
  { rotulo: "R$ 100", cor: "#A855F7", corTexto: "#FFFFFF" },                   // 4
  { rotulo: "10%",    cor: "#EC4899", corTexto: "#FFFFFF" },                   // 5
  { rotulo: "50%",    cor: "#F97316", corTexto: "#FFFFFF" },                   // 6  <-- premio fixo
  { rotulo: "Bola",   cor: "#06B6D4", corTexto: "#FFFFFF", emoji: "⚽" },      // 7
  { rotulo: "R$ 20",  cor: "#84CC16", corTexto: "#1F2937" },                   // 8
];

const SETOR_ANGULO = 360 / PREMIOS.length;       // 40deg
const PREMIADO_INDEX = PREMIOS.findIndex((p) => p.rotulo === "50%");
const VOLTAS_EXTRAS = 6;                          // 6 giros completos antes de parar
const ANGULO_FINAL_BASE = -(VOLTAS_EXTRAS * 360 + PREMIADO_INDEX * SETOR_ANGULO);

type Fase = "pronta" | "girando" | "premio";

type Props = {
  numero: string;
  cliente: DadosClienteUpsell;
  abrir: boolean;
  onFechar: () => void;
};

export function UpsellRoleta({ numero, cliente, abrir, onFechar }: Props) {
  const router = useRouter();
  const { ativar } = useUpsell();
  const [fase, setFase] = useState<Fase>("pronta");
  const [rotacao, setRotacao] = useState(0);

  // reseta quando o modal eh aberto
  useEffect(() => {
    if (abrir) {
      setFase("pronta");
      setRotacao(0);
    }
  }, [abrir]);

  if (!abrir) return null;

  const girar = () => {
    if (fase !== "pronta") return;
    // pequeno jitter aleatorio dentro do setor (de -15 a +15 graus) so pra parecer real
    const jitter = (Math.random() - 0.5) * (SETOR_ANGULO - 10);
    setRotacao(ANGULO_FINAL_BASE + jitter);
    setFase("girando");
    // duracao da animacao = 5s (mantem em sync com o CSS abaixo)
    setTimeout(() => setFase("premio"), 5100);
  };

  const resgatar = () => {
    ativar({
      pedidoRef: numero,
      cliente,
    });
    onFechar();
    router.push("/upsell");
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-roleta-fade">
      <div className="relative w-full max-w-md bg-gradient-to-br from-brand-dark via-gray-900 to-brand-dark rounded-3xl shadow-2xl overflow-hidden">
        {/* Confetes decorativos */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 20% 10%, rgba(254,205,16,0.4), transparent 40%), radial-gradient(circle at 80% 80%, rgba(239,68,68,0.3), transparent 40%)",
          }}
        />

        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative px-6 pt-6 pb-4 text-center">
          <div className="inline-flex items-center gap-1.5 bg-brand-yellow/20 border border-brand-yellow/40 text-brand-yellow rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Brinde do primeiro pedido
          </div>
          <h2 className="text-2xl font-extrabold text-white font-display leading-tight">
            Gire a roleta!
          </h2>
          <p className="text-xs text-white/70 mt-1">
            {fase === "pronta" && "Toque pra girar e ver seu prêmio"}
            {fase === "girando" && "Girando..."}
            {fase === "premio" && "Parabéns!"}
          </p>
        </div>

        {/* Roleta */}
        <div className="relative mx-auto w-[300px] h-[300px] mb-4">
          {/* ponteiro */}
          <div
            aria-hidden
            className="absolute left-1/2 -translate-x-1/2 -top-1 z-20 drop-shadow-lg"
            style={{
              width: 0,
              height: 0,
              borderLeft: "16px solid transparent",
              borderRight: "16px solid transparent",
              borderTop: "26px solid #FBBF24",
            }}
          />
          {/* miolo brilhante */}
          <div
            aria-hidden
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 shadow-[0_0_20px_rgba(254,205,16,0.6)] z-10 border-4 border-white flex items-center justify-center"
          >
            <Gift className="w-6 h-6 text-brand-dark" />
          </div>

          {/* disco */}
          <div
            className="w-full h-full rounded-full border-[6px] border-white shadow-2xl relative overflow-hidden"
            style={{
              background: gradientePremios(),
              transform: `rotate(${rotacao}deg)`,
              transition:
                fase === "girando"
                  ? "transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
                  : "none",
            }}
          >
            {/* linhas divisorias entre os setores */}
            {PREMIOS.map((_, i) => (
              <div
                key={`linha-${i}`}
                aria-hidden
                className="absolute top-1/2 left-1/2 origin-top pointer-events-none"
                style={{
                  width: 2,
                  height: "50%",
                  background: "rgba(255,255,255,0.35)",
                  transform: `translateX(-50%) rotate(${i * SETOR_ANGULO + SETOR_ANGULO / 2}deg)`,
                  transformOrigin: "50% 0",
                }}
              />
            ))}
            {/* rotulos dos premios — centro do setor i fica no angulo i*40 (medido do topo, horario) */}
            {PREMIOS.map((p, i) => {
              const ang = i * SETOR_ANGULO;
              return (
                <div
                  key={`rotulo-${i}`}
                  className="absolute top-1/2 left-1/2 pointer-events-none flex items-center justify-center font-extrabold whitespace-nowrap"
                  style={{
                    transform: `translate(-50%, -50%) rotate(${ang}deg) translateY(-110px)`,
                    color: p.corTexto,
                    textShadow: "0 1px 2px rgba(0,0,0,0.35)",
                    fontSize: p.emoji ? 26 : 14,
                    minWidth: 60,
                    height: 22,
                  }}
                >
                  {p.emoji ?? p.rotulo}
                </div>
              );
            })}
          </div>
        </div>

        {/* Acoes */}
        <div className="px-6 pb-6">
          {fase === "pronta" && (
            <button
              type="button"
              onClick={girar}
              className="w-full h-14 rounded-2xl font-extrabold text-base bg-gradient-to-r from-brand-yellow to-yellow-400 text-brand-dark shadow-lg shadow-yellow-500/30 active:scale-[0.98] transition-transform animate-roleta-pulse"
            >
              GIRAR ROLETA
            </button>
          )}

          {fase === "girando" && (
            <button
              type="button"
              disabled
              className="w-full h-14 rounded-2xl font-extrabold text-base bg-white/10 text-white/60 cursor-not-allowed"
            >
              Girando...
            </button>
          )}

          {fase === "premio" && (
            <div className="space-y-3 animate-roleta-fade">
              <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl p-5 text-center text-brand-dark shadow-lg">
                <p className="text-[11px] font-extrabold uppercase tracking-wider mb-1 opacity-80">
                  Você ganhou!
                </p>
                <p className="font-extrabold text-4xl font-display leading-none">
                  50% OFF
                </p>
                <p className="text-xs font-semibold mt-2 opacity-90">
                  Cupom no segundo pedido • válido por 5 minutos
                </p>
              </div>
              <button
                type="button"
                onClick={resgatar}
                className="w-full h-14 rounded-2xl font-extrabold text-base bg-brand-yellow text-brand-dark shadow-lg shadow-yellow-500/30 active:scale-[0.98] transition-transform"
              >
                Resgatar prêmio
              </button>
              <button
                type="button"
                onClick={onFechar}
                className="w-full h-11 rounded-2xl font-semibold text-sm text-white/70 hover:text-white"
              >
                Ignorar
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ze-roleta-fade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-roleta-fade { animation: ze-roleta-fade 240ms ease-out both; }
        @keyframes ze-roleta-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 10px 25px rgba(254,205,16,0.4); }
          50%      { transform: scale(1.03); box-shadow: 0 15px 35px rgba(254,205,16,0.6); }
        }
        .animate-roleta-pulse { animation: ze-roleta-pulse 1.6s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function gradientePremios() {
  // conic-gradient comecando em -20deg (-> setor 0 fica de -20 a 20, centrado em 0=topo)
  const stops = PREMIOS.map((p, i) => {
    const start = i * SETOR_ANGULO;
    const end = (i + 1) * SETOR_ANGULO;
    return `${p.cor} ${start}deg ${end}deg`;
  }).join(", ");
  return `conic-gradient(from ${-SETOR_ANGULO / 2}deg, ${stops})`;
}
