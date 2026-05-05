"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, MessageCircle, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { linkWhatsApp } from "@/lib/utils";
import { pedidoStatusEhPosPagamento } from "@/lib/pedido-status";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { canalPedido, type PedidoStatusBroadcast } from "@/lib/realtime-pedido-shared";
import { PagamentoConfirmado } from "./pagamento-confirmado";
import type { DadosClienteUpsell } from "@/contexts/UpsellContext";

type Props = {
  numero: string;
  qrCode: string | null;
  qrImage: string | null;
  initialStatus: string;
  initialPaidAt?: string | null;
  whatsappSuporte: string;
  cliente: DadosClienteUpsell;
};

const CHAVE_ROLETA_VISTA = (numero: string) => `ze:roleta-vista:${numero}`;
const POLL_INTERVALO_MS = 2000;

export function PixPagamento({
  numero,
  qrCode,
  qrImage,
  initialStatus,
  initialPaidAt,
  whatsappSuporte,
  cliente,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [paidAt, setPaidAt] = useState<string | null>(initialPaidAt ?? null);
  const [verificando, setVerificando] = useState(false);
  const [roletaAberta, setRoletaAberta] = useState(false);
  const [ultimaVerificacao, setUltimaVerificacao] = useState<number | null>(null);

  /** Sempre reflete o ultimo status (evita closure stale no polling). */
  const statusRef = useRef(initialStatus);
  statusRef.current = status;

  const roletaJaAgendadaRef = useRef(false);
  /** No browser o id é number; tipos do Node misturam Timeout no worker de build. */
  const roletaTimeoutRef = useRef<number | null>(null);
  /** Descarta respostas antigas de polls sobrepostos ou fora de ordem. */
  const verificarGenRef = useRef(0);
  /** Evita toast duplicado se varias verificacoes detectam o mesmo salto. */
  const toastConfirmacaoPosPagamentoRef = useRef(false);

  const pago = pedidoStatusEhPosPagamento(status);

  useEffect(() => {
    roletaJaAgendadaRef.current = false;
    verificarGenRef.current = 0;
    toastConfirmacaoPosPagamentoRef.current = false;
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

  /**
   * Aplica um status novo vindo de qualquer fonte (polling ou broadcast).
   * Centralizar aqui evita divergencia entre os caminhos.
   */
  const aplicarStatus = useCallback(
    (novo: string, paidAtNovo?: string | null) => {
      if (paidAtNovo) setPaidAt(paidAtNovo);
      const prev = statusRef.current;
      if (novo === prev) return;
      const eraPago = pedidoStatusEhPosPagamento(prev);
      const novoEPositivo = pedidoStatusEhPosPagamento(novo);
      // Resposta atrasada nao pode "desmarcar" um pagamento ja detectado.
      if (eraPago && !novoEPositivo) return;
      setStatus(novo);
      if (!eraPago && novoEPositivo) {
        if (!toastConfirmacaoPosPagamentoRef.current) {
          toastConfirmacaoPosPagamentoRef.current = true;
          toast.success("Pagamento confirmado!");
        }
        agendarRoleta();
      }
    },
    [agendarRoleta],
  );

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
      setUltimaVerificacao(Date.now());
      aplicarStatus(j.status, j.paidAt ?? null);
    } catch {
      if (gen === verificarGenRef.current) toast.error("Erro ao verificar pagamento");
    } finally {
      if (gen === verificarGenRef.current) setVerificando(false);
    }
  }, [numero, aplicarStatus]);

  // Polling a cada 2s enquanto nao pago.
  useEffect(() => {
    if (pago) return;
    void verificar();
    const id = window.setInterval(() => void verificar(), POLL_INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [pago, verificar]);

  // Ao voltar pra aba / focar a janela, conferir na hora.
  useEffect(() => {
    if (pago) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void verificar();
    };
    const onFocus = () => void verificar();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
    };
  }, [pago, verificar]);

  // Realtime: aviso instantaneo via Supabase broadcast (independe do polling).
  useEffect(() => {
    if (pago) return;
    const sb = createSupabaseBrowser();
    const ch = sb.channel(canalPedido(numero), {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "status" }, ({ payload }) => {
      const p = (payload ?? {}) as Partial<PedidoStatusBroadcast>;
      if (typeof p.status !== "string") return;
      aplicarStatus(p.status, typeof p.paid_at === "string" ? p.paid_at : null);
    }).subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [numero, pago, aplicarStatus]);

  // Pagina ja abre pago (F5): o polling nao roda — agenda a roleta aqui.
  useEffect(() => {
    if (!pago) return;
    agendarRoleta();
  }, [pago, agendarRoleta]);

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

  const ultimaVerificacaoTxt = ultimaVerificacao
    ? new Date(ultimaVerificacao).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

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
        Verificamos automaticamente a cada {POLL_INTERVALO_MS / 1000}s · última às {ultimaVerificacaoTxt}
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
