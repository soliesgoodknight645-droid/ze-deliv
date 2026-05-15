"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, CreditCard, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import {
  CANAL_ADMIN_ALERTAS,
  type AdminAlertaNovoPedido,
} from "@/lib/realtime-pedido-shared";

/**
 * Componente que vive no layout do admin. Faz duas coisas:
 *
 * 1. Subscreve no canal `admin:alertas` (Supabase Realtime broadcast). Quando
 *    chega um evento `novo_pedido` com `forma_pagamento === "card"`, dispara:
 *      - Beep audivel via Web Audio API (sem precisar de arquivo de audio).
 *      - Toast persistente com numero do pedido + valor + nome do cliente.
 *      - Notification do navegador (se autorizado).
 *
 * 2. Mostra um indicador flutuante (canto inferior direito) com um toggle:
 *      - Off (default): clica pra ativar; chama `unlock()` que solicita
 *        permissao de Notification e cria/resume o AudioContext (precisamos
 *        de interacao do usuario antes de tocar audio em alguns browsers).
 *      - On: clica pra silenciar.
 *
 * Estado persiste em localStorage pra nao precisar habilitar a cada navegacao.
 */

const STORAGE_KEY_ATIVO = "admin_alertas_som_ativo";

export function AdminAlertasNovoPedido() {
  const [ativo, setAtivo] = useState<boolean>(false);
  const [montado, setMontado] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Hidratacao: le preferencia do storage so no client (evita mismatch SSR)
  useEffect(() => {
    setMontado(true);
    try {
      const v = localStorage.getItem(STORAGE_KEY_ATIVO);
      setAtivo(v === "1");
    } catch {
      /* sem storage (modo privado etc) */
    }
  }, []);

  /** Toca uma sequencia de 2 beeps curtos via Web Audio API. */
  const tocarBeep = useCallback(() => {
    try {
      let ctx = audioCtxRef.current;
      if (!ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const tocarUm = (delaySec: number, freq: number) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const inicio = ctx!.currentTime + delaySec;
        const fim = inicio + 0.2;
        gain.gain.setValueAtTime(0.0001, inicio);
        gain.gain.exponentialRampToValueAtTime(0.4, inicio + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, fim);
        osc.connect(gain).connect(ctx!.destination);
        osc.start(inicio);
        osc.stop(fim + 0.02);
      };
      tocarUm(0, 880); // bip 1 — agudo
      tocarUm(0.25, 1175); // bip 2 — mais agudo (sequencia "ding-dong" invertida)
    } catch (e) {
      console.error("[admin-alertas] beep falhou", e);
    }
  }, []);

  /** Habilita som: solicita permissao de notificacao + cria AudioContext. */
  const ativar = useCallback(async () => {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor && !audioCtxRef.current) {
        audioCtxRef.current = new Ctor();
      }
      await audioCtxRef.current?.resume();
    } catch {
      /* ignora */
    }
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignora */
      }
    }
    setAtivo(true);
    try {
      localStorage.setItem(STORAGE_KEY_ATIVO, "1");
    } catch {
      /* ignora */
    }
    tocarBeep(); // beep de teste pra confirmar que ta funcionando
    toast.success("Alertas sonoros ativados — você vai ouvir um beep a cada pedido com cartão.");
  }, [tocarBeep]);

  const desativar = useCallback(() => {
    setAtivo(false);
    try {
      localStorage.setItem(STORAGE_KEY_ATIVO, "0");
    } catch {
      /* ignora */
    }
    toast("Alertas sonoros desativados", { icon: "🔕" });
  }, []);

  // Subscribe no canal global do admin
  useEffect(() => {
    if (!montado) return;
    const sb = createSupabaseBrowser();
    const ch = sb.channel(CANAL_ADMIN_ALERTAS, {
      config: { broadcast: { self: true } },
    });
    ch.on("broadcast", { event: "novo_pedido" }, ({ payload }) => {
      const p = (payload ?? {}) as Partial<AdminAlertaNovoPedido>;
      if (p.tipo !== "novo_pedido") return;
      if (p.forma_pagamento !== "card") return; // so cartao por enquanto

      const valor =
        typeof p.total === "number"
          ? p.total.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })
          : "";
      const cliente = p.cliente_nome ? ` — ${p.cliente_nome}` : "";
      const titulo = `Novo pedido ${p.numero ?? ""}`;
      const corpo = `Cartão${valor ? " · " + valor : ""}${cliente}`;

      toast.success(`${titulo} (${valor})${cliente}`, {
        description: "Pagamento com cartão registrado",
        duration: 15000,
      });

      if (ativo) {
        tocarBeep();
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification(titulo, { body: corpo, tag: `pedido-${p.numero}` });
          } catch {
            /* ignora */
          }
        }
      }
    });
    void ch.subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [montado, ativo, tocarBeep]);

  if (!montado) return null;

  return (
    <button
      type="button"
      onClick={() => (ativo ? desativar() : void ativar())}
      title={
        ativo
          ? "Alertas sonoros ativados — clique pra silenciar"
          : "Clique pra ativar alertas sonoros de novos pedidos com cartão"
      }
      className={`fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 px-3 h-10 rounded-full shadow-lg border-2 text-xs font-bold transition-colors ${
        ativo
          ? "bg-green-500 text-white border-green-600 hover:bg-green-600"
          : "bg-white text-brand-dark border-gray-300 hover:bg-gray-50"
      }`}
    >
      {ativo ? (
        <>
          <Volume2 className="w-4 h-4" />
          <Bell className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Alertas ON</span>
        </>
      ) : (
        <>
          <VolumeX className="w-4 h-4 text-gray-400" />
          <BellOff className="w-3.5 h-3.5 text-gray-400" />
          <CreditCard className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Ativar alertas</span>
        </>
      )}
    </button>
  );
}
