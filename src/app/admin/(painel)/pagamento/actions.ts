"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import {
  definirGatewayAtivo,
  definirMetodoAtivo,
  GATEWAYS_DISPONIVEIS,
  limparCooldownGateway,
  obterGatewayAtivo,
  obterMetodosAtivos,
  testarApenasGateway,
  type GatewayId,
  type MetodoPagamento,
} from "@/lib/pagamento/gateway";

export async function alternarGateway(
  novoGateway: GatewayId,
): Promise<{ ok: true; gateway: GatewayId } | { ok: false; erro: string }> {
  // Valida a partir da lista canonica de gateways suportados — assim quando
  // a gente plugar um gateway novo nao precisa mexer aqui de novo.
  const idsValidos = GATEWAYS_DISPONIVEIS.map((g) => g.id);
  if (!idsValidos.includes(novoGateway)) {
    return { ok: false, erro: "Gateway invalido" };
  }

  const sb = createSupabaseServer();
  const { data: userData } = await sb.auth.getUser();
  if (!userData.user) {
    return { ok: false, erro: "Nao autenticado" };
  }

  try {
    await definirGatewayAtivo(novoGateway, userData.user.email ?? undefined);
    revalidatePath("/admin/pagamento");
    return { ok: true, gateway: novoGateway };
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Erro ao salvar";
    return { ok: false, erro };
  }
}

export async function lerGatewayAtivo(): Promise<GatewayId> {
  return obterGatewayAtivo();
}

export async function alternarMetodo(
  metodo: MetodoPagamento,
  ativo: boolean,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!["pix", "card", "cash"].includes(metodo)) {
    return { ok: false, erro: "Metodo invalido" };
  }
  // Dinheiro fica desativado eternamente — nao trabalham com isso
  if (metodo === "cash" && ativo) {
    return { ok: false, erro: "Pagamento em dinheiro nao pode ser ativado." };
  }
  const sb = createSupabaseServer();
  const { data: userData } = await sb.auth.getUser();
  if (!userData.user) {
    return { ok: false, erro: "Nao autenticado" };
  }
  try {
    await definirMetodoAtivo(metodo, ativo, userData.user.email ?? undefined);
    revalidatePath("/admin/pagamento");
    revalidatePath("/checkout");
    return { ok: true };
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Erro ao salvar";
    return { ok: false, erro };
  }
}

export async function lerMetodosAtivos() {
  return obterMetodosAtivos();
}

// =====================================================================
// Diagnostico de gateway — usado no painel pra debugar quando o admin
// seleciona um gateway que esta caindo no failover.
// =====================================================================

const idsValidos = (): GatewayId[] => GATEWAYS_DISPONIVEIS.map((g) => g.id);

export async function limparCooldown(
  gateway: GatewayId,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!idsValidos().includes(gateway)) return { ok: false, erro: "Gateway invalido" };
  const sb = createSupabaseServer();
  const { data: userData } = await sb.auth.getUser();
  if (!userData.user) return { ok: false, erro: "Nao autenticado" };
  try {
    limparCooldownGateway(gateway);
    revalidatePath("/admin/pagamento");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro" };
  }
}

/**
 * Faz uma chamada PIX de R$3 no gateway especificado pra ver se ele
 * esta funcionando. Usa dados ficticios pra teste; o pedido NAO eh
 * salvo na base de pedidos — eh chamada direta no SDK.
 *
 * O valor eh R$3 (e nao R$1) porque a Promst exige minimo de R$3,00 por
 * cobranca. Os demais gateways aceitam R$3 sem problema. O PIX gerado eh
 * so de diagnostico — ninguem paga, entao o valor nao tem efeito real.
 */
export async function testarGateway(
  gateway: GatewayId,
): Promise<
  | { ok: true; gateway: GatewayId; transactionId: string; durMs: number }
  | { ok: false; erro: string; gateway: GatewayId }
> {
  if (!idsValidos().includes(gateway)) {
    return { ok: false, erro: "Gateway invalido", gateway };
  }
  const sb = createSupabaseServer();
  const { data: userData } = await sb.auth.getUser();
  if (!userData.user) return { ok: false, erro: "Nao autenticado", gateway };

  // Pra garantir que vamos testar O gateway escolhido (e nao cair no
  // failover), limpamos o cooldown dele primeiro.
  limparCooldownGateway(gateway);

  const r = await testarApenasGateway(gateway, {
    identifier: `TESTE-${Date.now()}`,
    amount: 3,
    client: {
      name: "Teste Admin",
      email: "teste@example.com",
      phone: "11999999999",
      document: "00000000191", // CPF de teste valido (Receita)
    },
    endereco: {
      cep: "01310000",
      street: "Av. Paulista",
      number: "1000",
      neighborhood: "Bela Vista",
      city: "Sao Paulo",
      state: "SP",
    },
    itens: [
      {
        id: "teste",
        nome: "Teste de gateway (R$3)",
        quantidade: 1,
        precoUnitario: 3,
      },
    ],
    metadata: { teste_diagnostico: true, por: userData.user.email ?? "?" },
  });

  revalidatePath("/admin/pagamento");

  if (r.ok) {
    return {
      ok: true,
      gateway: r.resposta.gateway,
      transactionId: r.resposta.transactionId,
      durMs: r.durMs,
    };
  }
  return { ok: false, gateway, erro: r.erro };
}
