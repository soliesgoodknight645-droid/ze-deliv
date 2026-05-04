"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChefHat,
  Clock,
  MessageCircle,
  Package,
  Truck,
} from "lucide-react";
import { linkWhatsApp } from "@/lib/utils";
import { UpsellRoleta } from "./upsell-roleta";
import type { DadosClienteUpsell } from "@/contexts/UpsellContext";

type Props = {
  numero: string;
  paidAt: string | null;
  whatsappSuporte: string;
  /** Dados do cliente do pedido pago — usados pra reaproveitar no upsell. */
  cliente: DadosClienteUpsell;
  /** Controle da roleta vem do componente pai (PixPagamento) que detecta a
   *  transicao de status. Centralizamos o controle pra a roleta abrir
   *  automaticamente mesmo quando a transicao acontece via polling. */
  roletaAberta: boolean;
  onFecharRoleta: () => void;
};

const TOTAL_SEGUNDOS = 30 * 60; // 30 minutos
const FASE_PREPARO = 8 * 60;     // 0-8min: em preparo
const FASE_SAINDO = 18 * 60;     // 8-18min: saindo
// 18min+ : a caminho / quase la

export function PagamentoConfirmado({
  numero,
  paidAt,
  whatsappSuporte,
  cliente,
  roletaAberta,
  onFecharRoleta,
}: Props) {

  // Marca de tempo do pagamento. Se o backend nao mandou paid_at por algum motivo,
  // usamos o "primeiro Date.now()" desta sessao como fallback (evita o cronometro
  // pular quando a pagina re-renderiza).
  const [inicioMs, setInicioMs] = useState<number>(() => {
    if (paidAt) return new Date(paidAt).getTime();
    return Date.now();
  });

  useEffect(() => {
    if (paidAt) {
      const t = new Date(paidAt).getTime();
      if (!Number.isNaN(t)) setInicioMs(t);
    }
  }, [paidAt]);

  const [agora, setAgora] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, Math.floor((agora - inicioMs) / 1000));
  const restante = Math.max(0, TOTAL_SEGUNDOS - elapsed);
  const minutos = Math.floor(restante / 60);
  const segundos = restante % 60;
  const progresso = Math.min(100, (elapsed / TOTAL_SEGUNDOS) * 100);

  const fase: "preparo" | "saindo" | "chegando" | "entregue" =
    elapsed >= TOTAL_SEGUNDOS
      ? "entregue"
      : elapsed >= FASE_SAINDO
        ? "chegando"
        : elapsed >= FASE_PREPARO
          ? "saindo"
          : "preparo";

  return (
    <div className="space-y-4 mb-4">
      {/* === HERO de confirmacao === */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-6 text-center relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 0%, rgba(34,197,94,0.15), transparent 60%)",
          }}
        />
        <div className="relative">
          <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30 animate-confirmacao">
            <CheckCircle2 className="w-12 h-12 text-white" strokeWidth={2.5} />
          </div>
          <h2 className="font-extrabold text-2xl text-green-900 mb-1 font-display">
            Pagamento confirmado!
          </h2>
          <p className="text-sm text-green-800/80">
            {fase === "entregue"
              ? "Seu pedido já deve ter chegado. Bom pedido! 🍻"
              : "Seu pedido entrou na fila. Já estamos preparando tudo."}
          </p>
        </div>
      </div>

      {/* === Cronometro === */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-brand-yellow" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Previsão de chegada
          </p>
        </div>

        <div className="flex items-baseline gap-2 mb-1">
          {fase === "entregue" ? (
            <span className="text-3xl font-extrabold text-brand-dark font-display">
              Chegando agora
            </span>
          ) : (
            <>
              <span className="text-5xl font-extrabold text-brand-dark font-display tabular-nums">
                {String(minutos).padStart(2, "0")}
                <span className="text-brand-yellow">:</span>
                {String(segundos).padStart(2, "0")}
              </span>
              <span className="text-sm text-gray-500 font-medium">restantes</span>
            </>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Tempo médio de entrega: 15 a 30 minutos
        </p>

        {/* Barra de progresso */}
        <div className="relative w-full h-2.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-yellow via-brand-yellow to-green-400 rounded-full transition-[width] duration-1000 ease-linear"
            style={{ width: `${progresso}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-[left] duration-1000 ease-linear"
            style={{ left: `${progresso}%` }}
            aria-hidden
          >
            <div className="w-4 h-4 rounded-full bg-white shadow-md border-2 border-brand-yellow" />
          </div>
        </div>

        {/* Etapas */}
        <div className="grid grid-cols-4 gap-1 mt-5">
          <Etapa
            Icon={CheckCircle2}
            label="Confirmado"
            estado="ok"
          />
          <Etapa
            Icon={ChefHat}
            label="Preparo"
            estado={fase === "preparo" ? "atual" : "ok"}
          />
          <Etapa
            Icon={Package}
            label="A caminho"
            estado={
              fase === "saindo" || fase === "chegando"
                ? "atual"
                : fase === "entregue"
                  ? "ok"
                  : "pendente"
            }
          />
          <Etapa
            Icon={Truck}
            label={fase === "entregue" ? "Entregue" : "Entrega"}
            estado={fase === "entregue" ? "atual" : "pendente"}
          />
        </div>
      </div>

      {/* === Acoes === */}
      <a
        href={linkWhatsApp(
          whatsappSuporte,
          `Olá! Acabei de pagar o pedido ${numero}. Pode confirmar pra mim?`,
        )}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full rounded-2xl bg-[#25D366] active:bg-[#1ebe5a] text-white flex items-center gap-3 px-4 py-3.5 active:scale-[0.98] transition shadow-md"
      >
        <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <MessageCircle className="w-5 h-5 text-white" />
        </span>
        <span className="flex-1 text-left leading-tight">
          <span className="block font-extrabold text-[15px]">
            Acompanhar pelo WhatsApp
          </span>
          <span className="block text-[11px] opacity-90 font-medium">
            Atendimento 24h • tire dúvidas sobre seu pedido
          </span>
        </span>
      </a>

      <style>{`
        @keyframes ze-confirmacao {
          0% { transform: scale(0.6); opacity: 0; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-confirmacao { animation: ze-confirmacao 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
      `}</style>

      <UpsellRoleta
        numero={numero}
        cliente={cliente}
        abrir={roletaAberta}
        onFechar={onFecharRoleta}
      />
    </div>
  );
}

function Etapa({
  Icon,
  label,
  estado,
}: {
  Icon: typeof Clock;
  label: string;
  estado: "ok" | "atual" | "pendente";
}) {
  const cor =
    estado === "ok"
      ? "bg-green-500 text-white"
      : estado === "atual"
        ? "bg-brand-yellow text-brand-dark animate-pulse"
        : "bg-gray-100 text-gray-400";
  const textoCor =
    estado === "pendente" ? "text-gray-400" : "text-brand-dark";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${cor}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <span className={`text-[10px] font-bold ${textoCor}`}>{label}</span>
    </div>
  );
}
