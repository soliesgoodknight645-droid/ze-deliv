"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { broadcastStatusPedido } from "@/lib/realtime-pedido";

export async function logout() {
  const sb = createSupabaseServer();
  await sb.auth.signOut();
  redirect("/admin/login");
}

export type StatusPedido =
  | "aguardando_pagamento"
  | "pago"
  | "em_separacao"
  | "em_entrega"
  | "concluido"
  | "cancelado";

async function ensureAdmin() {
  const sb = createSupabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("Não autenticado");

  const admin = createSupabaseAdmin();
  const { data: ehAdmin } = await admin
    .from("app_admins")
    .select("email")
    .ilike("email", data.user.email!)
    .maybeSingle();

  if (!ehAdmin) throw new Error("Não autorizado");
  return { user: data.user, admin };
}

export async function atualizarStatus(pedidoId: string, status: StatusPedido) {
  const { admin, user } = await ensureAdmin();

  const patch: Record<string, unknown> = { status };
  if (status === "pago") {
    patch.paid_at = new Date().toISOString();
    // Tag pra deixar claro no admin que foi marcado manualmente. Tambem evita
    // que webhooks futuros de "pending" rebaixem o pedido (os webhooks ja
    // checam status, mas registrar fica bom pra auditoria).
    patch.gateway_status = "ADMIN_MARCADO_PAGO";
  }

  const { data: pedido, error } = await admin
    .from("pedidos")
    .update(patch)
    .eq("id", pedidoId)
    .select("numero, paid_at, gateway_status")
    .single();
  if (error) throw new Error(error.message);

  // Evento de auditoria — bom pro admin ver o historico
  await admin.from("eventos_pedido").insert({
    pedido_id: pedidoId,
    tipo: status === "pago" ? "pagamento_manual" : `status_${status}`,
    dados: {
      novo_status: status,
      autor: user.email,
      via: "painel_admin",
    },
  });

  // Forca o Next a re-renderizar essas paginas com o novo status
  revalidatePath("/admin");
  if (pedido?.numero) {
    revalidatePath(`/admin/${pedido.numero}`);
    revalidatePath(`/pedido/${pedido.numero}`);
    // Aviso instantaneo pra a tela do cliente (Realtime broadcast).
    await broadcastStatusPedido(admin, pedido.numero as string, {
      status,
      paid_at: (pedido.paid_at as string | null) ?? null,
      gateway_status: (pedido.gateway_status as string | null) ?? null,
    });
  }
}
