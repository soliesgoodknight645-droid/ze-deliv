"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import {
  diagnosticarBucketCatalogo,
  garantirBucketCatalogoPublico,
  migrarUrlsPublicasParaSigned,
  uploadArquivoCatalogo,
  type DiagnosticoBucket,
} from "@/lib/storage-catalogo";

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
  revalidatePath("/admin/produtos");
}

/**
 * Action pro admin reparar manualmente o problema de fotos nao aparecendo:
 *   1. Garante bucket existe e ta marcado como public (forca, sem cache).
 *   2. Migra URLs antigas (public URLs do supabase) pra signed URLs com
 *      validade de 10 anos — signed URLs funcionam em qualquer config.
 *   3. Roda diagnostico final.
 *   4. Invalida cache do site pra fotos novas aparecerem.
 *
 * Retorna o resultado completo pra UI mostrar.
 */
export async function repararBucketImagens(): Promise<{
  ok: boolean;
  bucket: { ok: boolean; publico?: boolean; erro?: string };
  migracao: { produtosMigrados: number; categoriasMigradas: number; falhas: number; erros: string[] };
  diagnostico: DiagnosticoBucket;
}> {
  await ensureAdmin();
  const bucket = await garantirBucketCatalogoPublico(true);
  const migracao = await migrarUrlsPublicasParaSigned();
  const diagnostico = await diagnosticarBucketCatalogo();

  // Invalida cache do site pra fotos novas aparecerem
  revalidateTag("catalogo");
  revalidatePath("/", "layout");
  revalidatePath("/admin/produtos");
  revalidatePath("/admin/categorias");

  const ok =
    bucket.ok &&
    diagnostico.bucketExiste &&
    migracao.falhas === 0;
  return { ok, bucket, migracao, diagnostico };
}

export type ProdutoInput = {
  nome: string;
  slug?: string;
  descricao?: string | null;
  marca?: string | null;
  volume?: string | null;
  teor_alcoolico?: string | null;
  temperatura?: string | null;
  preco?: number | null;
  preco_promocional?: number | null;
  imagem_url?: string | null;
  em_estoque?: boolean;
  destaque?: boolean;
  mais_vendido?: boolean;
  novo?: boolean;
  ordem?: number;
  publicado?: boolean;
  categoria_id: string;
};

export async function criarProduto(
  input: ProdutoInput,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  try {
    await ensureAdmin();
    if (!input.nome?.trim()) return { ok: false, erro: "Nome obrigatório" };
    if (!input.categoria_id) return { ok: false, erro: "Categoria obrigatória" };

    let slug = (input.slug?.trim() || slugify(input.nome)).slice(0, 100);

    const admin = createSupabaseAdmin();
    // Garante slug unico (adiciona sufixo se ja existe)
    const baseSlug = slug;
    let n = 1;
    while (true) {
      const { data: dup } = await admin
        .from("produtos")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!dup) break;
      n++;
      slug = `${baseSlug}-${n}`;
      if (n > 50) return { ok: false, erro: "Não foi possível gerar slug único" };
    }

    const { data: maxOrdem } = await admin
      .from("produtos")
      .select("ordem")
      .eq("categoria_id", input.categoria_id)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await admin
      .from("produtos")
      .insert({
        nome: input.nome.trim(),
        slug,
        descricao: input.descricao?.trim() || null,
        marca: input.marca?.trim() || null,
        volume: input.volume?.trim() || null,
        teor_alcoolico: input.teor_alcoolico?.trim() || null,
        temperatura: input.temperatura?.trim() || null,
        preco: input.preco ?? null,
        preco_promocional: input.preco_promocional ?? null,
        imagem_url: input.imagem_url || null,
        em_estoque: input.em_estoque ?? true,
        destaque: input.destaque ?? false,
        mais_vendido: input.mais_vendido ?? false,
        novo: input.novo ?? false,
        ordem: input.ordem ?? (maxOrdem?.ordem ?? 0) + 10,
        publicado: input.publicado ?? true,
        categoria_id: input.categoria_id,
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

export async function atualizarProduto(
  id: string,
  input: ProdutoInput,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    await ensureAdmin();
    if (!input.nome?.trim()) return { ok: false, erro: "Nome obrigatório" };

    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("produtos")
      .update({
        nome: input.nome.trim(),
        slug: input.slug?.trim() || slugify(input.nome),
        descricao: input.descricao?.trim() || null,
        marca: input.marca?.trim() || null,
        volume: input.volume?.trim() || null,
        teor_alcoolico: input.teor_alcoolico?.trim() || null,
        temperatura: input.temperatura?.trim() || null,
        preco: input.preco ?? null,
        preco_promocional: input.preco_promocional ?? null,
        imagem_url: input.imagem_url ?? null,
        em_estoque: input.em_estoque,
        destaque: input.destaque,
        mais_vendido: input.mais_vendido,
        novo: input.novo,
        ordem: input.ordem,
        publicado: input.publicado,
        categoria_id: input.categoria_id,
      })
      .eq("id", id);

    if (error) return { ok: false, erro: error.message };
    invalidarCatalogo();
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function excluirProduto(
  id: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    await ensureAdmin();
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("produtos").delete().eq("id", id);
    if (error) return { ok: false, erro: error.message };
    invalidarCatalogo();
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function reordenarProdutos(
  ordens: { id: string; ordem: number }[],
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    await ensureAdmin();
    const admin = createSupabaseAdmin();

    for (const { id, ordem } of ordens) {
      const { error } = await admin.from("produtos").update({ ordem }).eq("id", id);
      if (error) return { ok: false, erro: error.message };
    }
    invalidarCatalogo();
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function uploadImagemProduto(formData: FormData): Promise<{
  ok: true;
  url: string;
} | { ok: false; erro: string }> {
  try {
    await ensureAdmin();
    const file = formData.get("file") as File | null;
    const slug = (formData.get("slug") as string) || `prod-${Date.now()}`;
    if (!file) return { ok: false, erro: "Arquivo obrigatório" };

    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `produtos/${slug}-${Date.now()}.${ext}`;

    return await uploadArquivoCatalogo(file, path);
  } catch (e: unknown) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function novoProdutoERedirect(input: ProdutoInput) {
  const r = await criarProduto(input);
  if (!r.ok) throw new Error(r.erro);
  redirect(`/admin/produtos/${r.id}`);
}
