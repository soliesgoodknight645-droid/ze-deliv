"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import {
  definirGatewayAtivo,
  definirMetodoAtivo,
  GATEWAYS_DISPONIVEIS,
  obterGatewayAtivo,
  obterMetodosAtivos,
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
