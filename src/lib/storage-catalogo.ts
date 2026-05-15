import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

// =====================================================================
// Helpers do bucket "catalogo" — usados pra upload de imagem de produto
// e categoria pelo painel admin.
//
// Por que isso existe: a migration 0011 que marca o bucket como publico
// + cria policies precisa ser rodada manualmente no SQL Editor. Se nao
// for feito, getPublicUrl devolve URLs que dao 400/403 e as fotos sobem
// mas nao aparecem no site. Aqui a gente:
//   1. Garante via API admin do Supabase (service_role) que o bucket
//      existe e ta marcado como public. Idempotente.
//   2. Faz HEAD na URL publica depois do upload — se ela nao for
//      acessivel, gera signed URL com 10 anos (funciona ate com
//      bucket privado).
// =====================================================================

export const BUCKET_CATALOGO = "catalogo";

const TTL_GARANTIA_MS = 6 * 60 * 60 * 1000; // 6h
let bucketGarantidoEm = 0;

export type ResultadoBucket =
  | { ok: true; publico: boolean }
  | { ok: false; erro: string };

/**
 * Garante que o bucket existe e esta marcado como public. Idempotente,
 * com cache de 6h em memoria pra evitar chamada de API a cada upload.
 * Use `force=true` pra ignorar o cache (ex: action "Reparar bucket").
 */
export async function garantirBucketCatalogoPublico(
  force = false,
): Promise<ResultadoBucket> {
  if (!force && bucketGarantidoEm > Date.now() - TTL_GARANTIA_MS) {
    return { ok: true, publico: true };
  }
  try {
    const admin = createSupabaseAdmin();
    const { data: existente, error: errGet } = await admin.storage.getBucket(
      BUCKET_CATALOGO,
    );
    if (errGet || !existente) {
      const { error: errCreate } = await admin.storage.createBucket(BUCKET_CATALOGO, {
        public: true,
      });
      if (errCreate && !/already exists/i.test(errCreate.message)) {
        throw new Error(`createBucket: ${errCreate.message}`);
      }
    } else if (!existente.public) {
      const { error: errUpdate } = await admin.storage.updateBucket(BUCKET_CATALOGO, {
        public: true,
      });
      if (errUpdate) throw new Error(`updateBucket: ${errUpdate.message}`);
    }
    bucketGarantidoEm = Date.now();
    return { ok: true, publico: true };
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[storage/catalogo] garantirBucketPublico falhou", erro);
    return { ok: false, erro };
  }
}

/**
 * Gera signed URL com validade longa (10 anos) — fallback caso a
 * public URL nao funcione. Funciona com bucket privado tambem.
 */
export async function gerarSignedUrlLongaCatalogo(
  path: string,
): Promise<string | null> {
  try {
    const admin = createSupabaseAdmin();
    const dezAnos = 60 * 60 * 24 * 365 * 10;
    const { data, error } = await admin.storage
      .from(BUCKET_CATALOGO)
      .createSignedUrl(path, dezAnos);
    if (error || !data?.signedUrl) {
      console.error("[storage/catalogo] signed url falhou", error?.message);
      return null;
    }
    return data.signedUrl;
  } catch (e) {
    console.error("[storage/catalogo] signed url exception", e);
    return null;
  }
}

/** HEAD na URL pra ver se ela ta acessivel anonimamente. */
export async function urlAcessivel(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Faz upload de um arquivo no bucket "catalogo" e devolve uma URL que
 * funciona no navegador (publica se o bucket ta publico, signed URL como
 * fallback). Centraliza a logica usada por produtos e categorias.
 */
export async function uploadArquivoCatalogo(
  file: File,
  path: string,
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  await garantirBucketCatalogoPublico();

  const admin = createSupabaseAdmin();
  const { error } = await admin.storage
    .from(BUCKET_CATALOGO)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) return { ok: false, erro: error.message };

  const { data } = admin.storage.from(BUCKET_CATALOGO).getPublicUrl(path);
  const urlPublica = data.publicUrl;

  if (await urlAcessivel(urlPublica)) {
    return { ok: true, url: urlPublica };
  }

  console.warn(
    `[storage/catalogo] URL publica nao acessivel pra ${path} — gerando signed URL`,
  );
  const signed = await gerarSignedUrlLongaCatalogo(path);
  if (signed) return { ok: true, url: signed };

  // Ultimo recurso: devolve a publica mesmo (o admin vai ver a quebra e
  // pode clicar em "Reparar bucket" no painel).
  return { ok: true, url: urlPublica };
}
