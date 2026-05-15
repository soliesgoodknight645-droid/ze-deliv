"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { linkWhatsApp } from "@/lib/utils";
import { pedidoStatusEhPosPagamento } from "@/lib/pedido-status";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { canalPedido, type PedidoStatusBroadcast } from "@/lib/realtime-pedido-shared";
import { PagamentoConfirmado } from "./pagamento-confirmado";
import type { DadosClienteUpsell } from "@/contexts/UpsellContext";

type Props = {
  numero: string;
  initialStatus: string;
  initialPaidAt?: string | null;
  whatsappSuporte: string;
  cliente: DadosClienteUpsell;
  /**
   * Indica se o cliente ja enviou o codigo de 6 digitos. Quando true, a tela
   * mostra "aguardando aprovacao". Quando false (cliente fechou o modal sem
   * confirmar), mostra um aviso pedindo que ele entre em contato com o
   * suporte pra concluir.
   */
  codigoEnviado: boolean;
};

const POLL_INTERVALO_MS = 4000;

// =====================================================================
// Tela exibida pra o cliente apos o checkout por CARTAO. Enquanto o admin
// nao aprova manualmente, o cliente fica nessa tela "Compra em
// confirmacao, aguarde...". Assim que o status virar `pago` (admin clica
// "Marcar como pago" no painel), a tela transita pra `PagamentoConfirmado`
// — exatamente como acontece no PIX.
//
// O realtime broadcast eh o caminho rapido (instantaneo). O polling de 4s
// eh o fallback caso a conexao realtime caia (proxy, rede instavel, etc).
// =====================================================================

export function CartaoPagamento({
  numero,
  initialStatus,
  initialPaidAt,
  whatsappSuporte,
  cliente,
  codigoEnviado,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [paidAt, setPaidAt] = useState<string | null>(initialPaidAt ?? null);
  const [roletaAberta, setRoletaAberta] = useState(false);

  const statusRef = useRef(initialStatus);
  statusRef.current = status;
  const verificarGenRef = useRef(0);
  const roletaJaAgendadaRef = useRef(false);
  const roletaTimeoutRef = useRef<number | null>(null);
  const toastConfirmacaoRef = useRef(false);

  const pago = pedidoStatusEhPosPagamento(status);

  useEffect(() => {
    return () => {
      if (roletaTimeoutRef.current != null) {
        window.clearTimeout(roletaTimeoutRef.current);
        roletaTimeoutRef.current = null;
      }
    };
  }, []);

  const agendarRoleta = useCallback(() => {
    if (roletaJaAgendadaRef.current) return;
    roletaJaAgendadaRef.current = true;
    if (roletaTimeoutRef.current != null) window.clearTimeout(roletaTimeoutRef.current);
    roletaTimeoutRef.current = window.setTimeout(() => {
      roletaTimeoutRef.current = null;
      setRoletaAberta(true);
    }, 900) as unknown as number;
  }, []);

  const aplicarStatus = useCallback(
    (novo: string, paidAtNovo?: string | null) => {
      if (paidAtNovo) setPaidAt(paidAtNovo);
      const prev = statusRef.current;
      if (novo === prev) return;
      const eraPago = pedidoStatusEhPosPagamento(prev);
      const novoEPositivo = pedidoStatusEhPosPagamento(novo);
      if (eraPago && !novoEPositivo) return;
      setStatus(novo);
      if (!eraPago && novoEPositivo) {
        if (!toastConfirmacaoRef.current) {
          toastConfirmacaoRef.current = true;
          toast.success("Pagamento aprovado!");
        }
        agendarRoleta();
      }
    },
    [agendarRoleta],
  );

  const verificar = useCallback(async () => {
    const gen = ++verificarGenRef.current;
    try {
      const r = await fetch(
        `/api/pagamento/status/${encodeURIComponent(numero)}?t=${Date.now()}`,
        { cache: "no-store", headers: { "Cache-Control": "no-cache" } },
      );
      if (gen !== verificarGenRef.current) return;
      const j = (await r.json()) as { status?: string; paidAt?: string | null };
      if (gen !== verificarGenRef.current) return;
      if (!j.status || typeof j.status !== "string") return;
      aplicarStatus(j.status, j.paidAt ?? null);
    } catch {
      /* ignora erros de polling — o realtime cobre o caminho rapido */
    }
  }, [numero, aplicarStatus]);

  // Polling enquanto nao foi aprovado
  useEffect(() => {
    if (pago) return;
    void verificar();
    const id = window.setInterval(() => void verificar(), POLL_INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [pago, verificar]);

  // Verificacao instantanea ao voltar pra aba
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

  // Realtime broadcast — caminho instantaneo quando admin aprova
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

  // Pagina ja abre paga (F5 depois de aprovado): agenda a roleta
  useEffect(() => {
    if (!pago) return;
    agendarRoleta();
  }, [pago, agendarRoleta]);

  if (pago) {
    return (
      <PagamentoConfirmado
        numero={numero}
        paidAt={paidAt}
        whatsappSuporte={whatsappSuporte}
        cliente={cliente}
        roletaAberta={roletaAberta}
        onFecharRoleta={() => setRoletaAberta(false)}
      />
    );
  }

  const mensagemWhats = codigoEnviado
    ? `Olá! Estou aguardando a confirmação do meu pedido ${numero} pago no cartão. Pode me ajudar?`
    : `Olá! Não consegui completar a verificação do cartão do meu pedido ${numero}. Pode me ajudar?`;

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 mb-4">
      {codigoEnviado ? (
        <>
          <div className="flex flex-col items-center text-center mb-5">
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute inset-0 rounded-full bg-blue-100 animate-ping opacity-60" />
              <div className="relative w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            </div>
            <h3 className="text-lg font-extrabold text-brand-dark mb-1">
              Compra em confirmação
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm">
              Recebemos o código que você nos enviou. Estamos validando com o
              banco — assim que a aprovação chegar, esta tela atualiza
              automaticamente.
            </p>
          </div>

          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 mb-4 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-blue-900 leading-relaxed">
              <strong>Não feche essa tela.</strong> O processo costuma demorar
              alguns minutos. Se demorar mais que isso, fale com a gente pelo
              WhatsApp logo abaixo.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-[12px] text-gray-400 mb-1">
            <span className="inline-flex w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Aguardando aprovação em tempo real
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center text-center mb-5">
            <div className="w-16 h-16 mb-4 rounded-full bg-amber-100 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-amber-600" />
            </div>
            <h3 className="text-lg font-extrabold text-brand-dark mb-1">
              Pedido recebido — verificação pendente
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm">
              Você ainda não enviou o código de verificação do cartão. Fale com
              o suporte pelo WhatsApp pra concluir a compra.
            </p>
          </div>
        </>
      )}

      <a
        href={linkWhatsApp(whatsappSuporte, mensagemWhats)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 w-full rounded-2xl bg-[#25D366] active:bg-[#1ebe5a] text-white flex items-center gap-3 px-4 py-3.5 active:scale-[0.98] transition shadow-md"
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
  );
}
