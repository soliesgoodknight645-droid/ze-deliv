"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { uploadArquivoCatalogo } from "@/lib/storage-catalogo";

async function ensureAdmin() {
  const sb = createSupabaseServer();
  const { data } = await sb.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) throw new Error("Não autenticado");

  const admin = createSupabaseAdmin();
  const { data: row } = await admin
    .from("app_admins")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (!row) throw new Error("Sem permissão de admin");
}

function invalidarCatalogo() {
  revalidateTag("catalogo");
  revalidatePath("/", "layout");
  revalidatePath("/admin/categorias");
  revalidatePath("/admin/produtos");
}

export type CategoriaInput = {
  nome: string;
  slug?: string;
  descricao?: string;
  icone?: string;
  imagem_url?: string | null;
  ordem?: number;
  publicada?: boolean;
};

export async function criarCategoria(
  input: CategoriaInput,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  try {
    await ensureAdmin();
    if (!input.nome?.trim()) return { ok: false, erro: "Nome obrigatório" };

    const slug = (input.slug?.trim() || slugify(input.nome)).slice(0, 80);
    const admin = createSupabaseAdmin();

    const { data: maxOrdem } = await admin
      .from("categorias")
      .select("ordem")
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await admin
      .from("categorias")
      .insert({
        nome: input.nome.trim(),
        slug,
        descricao: input.descricao?.trim() || null,
        icone: input.icone?.trim() || null,
        imagem_url: input.imagem_url || null,
        ordem: input.ordem ?? (maxOrdem?.ordem ?? 0) + 10,
        publicada: input.publicada ?? true,
      })
      .select("id")
      .single();

    if (error) return { ok: false, erro: error.message };
    invalidarCatalogo();
    return { ok: true, id: data.id };
  } catch (e: unknown) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function atualizarCategoria(
  id: string,
  input: CategoriaInput,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    await ensureAdmin();
    if (!input.nome?.trim()) return { ok: false, erro: "Nome obrigatório" };

    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("categorias")
      .update({
        nome: input.nome.trim(),
        slug: input.slug?.trim() || slugify(input.nome),
        descricao: input.descricao?.trim() || null,
        icone: input.icone?.trim() || null,
        imagem_url: input.imagem_url ?? null,
        ordem: input.ordem,
        publicada: input.publicada,
      })
      .eq("id", id);

    if (error) return { ok: false, erro: error.message };
    invalidarCatalogo();
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function excluirCategoria(
  id: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    await ensureAdmin();
    const admin = createSupabaseAdmin();

    const { count } = await admin
      .from("produtos")
      .select("id", { count: "exact", head: true })
      .eq("categoria_id", id);

    if ((count ?? 0) > 0) {
      return {
        ok: false,
        erro: `Categoria tem ${count} produto(s). Mova ou exclua eles antes.`,
      };
    }

    const { error } = await admin.from("categorias").delete().eq("id", id);
    if (error) return { ok: false, erro: error.message };
    invalidarCatalogo();
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function reordenarCategorias(
  ordens: { id: string; ordem: number }[],
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    await ensureAdmin();
    const admin = createSupabaseAdmin();

    for (const { id, ordem } of ordens) {
      const { error } = await admin.from("categorias").update({ ordem }).eq("id", id);
      if (error) return { ok: false, erro: error.message };
    }
    invalidarCatalogo();
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function uploadImagemCategoria(formData: FormData): Promise<{
  ok: true;
  url: string;
} | { ok: false; erro: string }> {
  try {
    await ensureAdmin();
    const file = formData.get("file") as File | null;
    const slug = (formData.get("slug") as string) || `cat-${Date.now()}`;
    if (!file) return { ok: false, erro: "Arquivo obrigatório" };

    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `categorias/${slug}-${Date.now()}.${ext}`;

    return await uploadArquivoCatalogo(file, path);
  } catch (e: unknown) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function novaCategoriaERedirect(input: CategoriaInput) {
  const r = await criarCategoria(input);
  if (!r.ok) throw new Error(r.erro);
  redirect(`/admin/categorias/${r.id}`);
}
