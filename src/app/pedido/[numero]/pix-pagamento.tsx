"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, MessageCircle, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { linkWhatsApp } from "@/lib/utils";
import { PagamentoConfirmado } from "./pagamento-confirmado";
import type { DadosClienteUpsell } from "@/contexts/UpsellContext";

type Props = {
  numero: string;
  qrCode: string | null;
  qrImage: string | null;
  receiptUrl?: string | null;
  initialStatus: string;
  initialPaidAt?: string | null;
  whatsappSuporte: string;
  cliente: DadosClienteUpsell;
};

const CHAVE_ROLETA_VISTA = (numero: string) => `ze:roleta-vista:${numero}`;

export function PixPagamento({
  numero,
  qrCode,
  qrImage,
  receiptUrl,
  initialStatus,
  initialPaidAt,
  whatsappSuporte,
  cliente,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [paidAt, setPaidAt] = useState<string | null>(initialPaidAt ?? null);
  const [verificando, setVerificando] = useState(false);
  const [roletaAberta, setRoletaAberta] = useState(false);

  /** Sempre reflete o ultimo status (evita closure stale no polling). */
  const statusRef = useRef(initialStatus);
  statusRef.current = status;

  const roletaJaAgendadaRef = useRef(false);
  /** No browser o id é number; tipos do Node misturam Timeout no worker de build. */
  const roletaTimeoutRef = useRef<number | null>(null);
  /** Descarta respostas antigas de polls sobrepostos ou fora de ordem. */
  const verificarGenRef = useRef(0);

  const pago = status === "pago" || status === "concluido";

  useEffect(() => {
    roletaJaAgendadaRef.current = false;
    verificarGenRef.current = 0;
  }, [numero]);

  useEffect(() => {
    return () => {
      roletaJaAgendadaRef.current = false;
      if (roletaTimeoutRef.current != null) {
        window.clearTimeout(roletaTimeoutRef.current);
        roletaTimeoutRef.current = null;
      }
    };
  }, []);

  const agendarRoleta = useCallback(() => {
    if (roletaJaAgendadaRef.current) return;
    let visto = false;
    try {
      visto = !!localStorage.getItem(CHAVE_ROLETA_VISTA(numero));
    } catch {
      /* modo anonimo etc. */
    }
    if (visto) return;
    roletaJaAgendadaRef.current = true;
    if (roletaTimeoutRef.current != null) window.clearTimeout(roletaTimeoutRef.current);
    roletaTimeoutRef.current = window.setTimeout(() => {
      roletaTimeoutRef.current = null;
      setRoletaAberta(true);
    }, 900) as unknown as number;
  }, [numero]);

  const verificar = useCallback(async () => {
    const gen = ++verificarGenRef.current;
    setVerificando(true);
    try {
      const r = await fetch(
        `/api/pagamento/status/${encodeURIComponent(numero)}?t=${Date.now()}`,
        { cache: "no-store", headers: { "Cache-Control": "no-cache" } },
      );
      if (gen !== verificarGenRef.current) return;
      const j = (await r.json()) as { status?: string; paidAt?: string | null; erro?: string };
      if (gen !== verificarGenRef.current) return;
      if (!r.ok || j.erro) return;
      if (!j.status || typeof j.status !== "string") return;

      if (j.paidAt) setPaidAt(j.paidAt);

      const prev = statusRef.current;
      const novo = j.status;
      if (novo === prev) return;

      // Resposta atrasada não pode "desmarcar" um pagamento já detectado.
      const jaEraPago = prev === "pago" || prev === "concluido";
      const novoEPositivo = novo === "pago" || novo === "concluido";
      if (jaEraPago && !novoEPositivo) return;

      const eraPago = jaEraPago;
      setStatus(novo);

      if (!eraPago && novo === "pago") toast.success("Pagamento confirmado!");
      if (!eraPago && (novo === "pago" || novo === "concluido")) agendarRoleta();
    } catch {
      if (gen === verificarGenRef.current) toast.error("Erro ao verificar pagamento");
    } finally {
      if (gen === verificarGenRef.current) setVerificando(false);
    }
  }, [numero, agendarRoleta]);

  // Consulta imediata + a cada 3s enquanto nao pago.
  useEffect(() => {
    if (pago) return;
    void verificar();
    const id = window.setInterval(() => void verificar(), 3000);
    return () => window.clearInterval(id);
  }, [pago, numero, verificar]);

  // Ao voltar pra aba, conferir na hora (intervalo costuma ser atrasado em background).
  useEffect(() => {
    if (pago) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void verificar();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pago, verificar]);

  // Pagina ja abre pago (F5): o polling nao roda — agenda a roleta aqui.
  useEffect(() => {
    if (!pago) return;
    agendarRoleta();
  }, [pago, numero, agendarRoleta]);

  const fecharRoleta = () => {
    setRoletaAberta(false);
    try {
      localStorage.setItem(CHAVE_ROLETA_VISTA(numero), "1");
    } catch {}
  };

  if (pago) {
    return (
      <PagamentoConfirmado
        numero={numero}
        paidAt={paidAt}
        receiptUrl={receiptUrl}
        whatsappSuporte={whatsappSuporte}
        cliente={cliente}
        roletaAberta={roletaAberta}
        onFecharRoleta={fecharRoleta}
      />
    );
  }

  if (!qrCode) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 text-center">
        <p className="text-sm text-gray-500">PIX não disponível. Entre em contato pelo WhatsApp.</p>
      </div>
    );
  }

  async function copiar() {
    if (!qrCode) return;
    try {
      await navigator.clipboard.writeText(qrCode);
      toast.success("Código PIX copiado!");
    } catch {
      toast.error("Erro ao copiar");
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
      <h3 className="text-base font-bold text-brand-dark mb-1">Pague com PIX</h3>
      <p className="text-xs text-gray-500 mb-4">
        Escaneie o QR Code ou copie o código abaixo. Assim que pagar, seu pedido entra em separação.
      </p>

      {qrImage && (
        <div className="mx-auto w-56 h-56 bg-white border border-gray-100 rounded-xl overflow-hidden mb-4 flex items-center justify-center p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImage}
            alt="QR Code PIX"
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3">
        <p className="text-[10px] uppercase font-semibold text-gray-400 mb-1">PIX copia e cola</p>
        <p className="text-xs text-gray-700 break-all leading-snug font-mono">{qrCode}</p>
      </div>

      <button
        type="button"
        onClick={copiar}
        className="w-full h-12 rounded-xl bg-brand-yellow text-brand-dark font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        <Copy className="w-4 h-4" /> Copiar código PIX
      </button>

      <button
        type="button"
        onClick={() => void verificar()}
        disabled={verificando}
        className="w-full h-11 mt-2 rounded-xl border border-gray-200 text-sm font-semibold text-brand-dark flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
      >
        <RefreshCcw className={`w-4 h-4 ${verificando ? "animate-spin" : ""}`} />
        {verificando ? "Verificando..." : "Já paguei, verificar"}
      </button>

      <p className="text-[11px] text-gray-400 text-center mt-3">
        Verificamos automaticamente a cada 3 segundos.
      </p>

      <div className="mt-5 pt-4 border-t border-gray-100">
        <a
          href={linkWhatsApp(
            whatsappSuporte,
            `Olá! Tive um problema com o pagamento do pedido ${numero}. Pode me ajudar?`,
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full rounded-2xl bg-[#25D366] active:bg-[#1ebe5a] text-white flex items-center gap-3 px-4 py-3.5 active:scale-[0.98] transition shadow-md"
        >
          <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-5 h-5 text-white" />
          </span>
          <span className="flex-1 text-left leading-tight">
            <span className="block font-extrabold text-[15px]">Falar com o suporte</span>
            <span className="block text-[11px] opacity-90 font-medium">
              Atendimento 24h pelo WhatsApp
            </span>
          </span>
        </a>
      </div>
    </div>
  );
}
