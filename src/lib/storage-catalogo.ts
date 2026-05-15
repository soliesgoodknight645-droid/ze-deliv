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
 * Faz upload de um arquivo no bucket "catalogo" e devolve uma SIGNED URL
 * com validade de 10 anos. Centraliza a logica usada por produtos e
 * categorias.
 *
 * Por que sempre signed URL: a public URL depende do bucket estar
 * marcado como public E de policies de SELECT em storage.objects. Em
 * alguns ambientes Supabase, mesmo marcando o bucket como public via
 * API, ainda fica algum bloqueio que faz a URL retornar 400/403 do
 * navegador. Signed URL funciona em QUALQUER config — eh autenticada
 * com token na propria URL, independe de bucket publico/policy/RLS.
 */
export async function uploadArquivoCatalogo(
  file: File,
  path: string,
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  // Garante bucket existe (criar se nao existe) — sem signed URL nao
  // funciona sem o bucket. Marca como public tambem pra nao machucar
  // (alguns places leem pelo public ainda).
  await garantirBucketCatalogoPublico();

  const admin = createSupabaseAdmin();
  const { error } = await admin.storage
    .from(BUCKET_CATALOGO)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) return { ok: false, erro: error.message };

  const signed = await gerarSignedUrlLongaCatalogo(path);
  if (signed) return { ok: true, url: signed };

  // Fallback de ultimo recurso: public URL (pode quebrar mas eh melhor
  // que nada, e o admin vai ver na hora pra clicar em "Reparar fotos").
  const { data } = admin.storage.from(BUCKET_CATALOGO).getPublicUrl(path);
  console.warn(
    `[storage/catalogo] signed URL falhou pra ${path} — usando public URL como fallback`,
  );
  return { ok: true, url: data.publicUrl };
}

// =====================================================================
// Migracao de URLs antigas
//
// Quando o bucket estava privado, getPublicUrl gerava URLs que sao
// salvas no banco em produtos.imagem_url / categorias.imagem_url mas
// dao 400/403 no navegador. Esta funcao detecta essas URLs, extrai o
// path do arquivo e regenera como signed URL (que sempre funciona).
// =====================================================================

const REGEX_PUBLIC_URL_CATALOGO =
  /\/storage\/v1\/object\/public\/catalogo\/(.+?)(?:\?.*)?$/;

/** Extrai o `path` do arquivo de uma URL publica do bucket. */
export function pathDaUrlPublica(url: string): string | null {
  if (!url) return null;
  const m = REGEX_PUBLIC_URL_CATALOGO.exec(url);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * Detecta URLs publicas do bucket "catalogo" em produtos/categorias e
 * regenera como signed URL. Retorna quantos foram migrados/falharam.
 */
export async function migrarUrlsPublicasParaSigned(): Promise<{
  produtosMigrados: number;
  categoriasMigradas: number;
  falhas: number;
  erros: string[];
}> {
  const admin = createSupabaseAdmin();
  const erros: string[] = [];
  let produtosMigrados = 0;
  let categoriasMigradas = 0;
  let falhas = 0;

  // Garante bucket OK antes (signed URL falha se bucket nao existe)
  await garantirBucketCatalogoPublico(true);

  const tabelas = [
    { nome: "produtos", contador: () => produtosMigrados++ },
    { nome: "categorias", contador: () => categoriasMigradas++ },
  ] as const;

  for (const t of tabelas) {
    const { data, error } = await admin
      .from(t.nome)
      .select("id, imagem_url")
      .like("imagem_url", "%/storage/v1/object/public/catalogo/%");

    if (error) {
      erros.push(`${t.nome}: ${error.message}`);
      continue;
    }

    for (const row of data ?? []) {
      const urlAntiga = row.imagem_url as string | null;
      if (!urlAntiga) continue;
      const path = pathDaUrlPublica(urlAntiga);
      if (!path) continue;

      const signed = await gerarSignedUrlLongaCatalogo(path);
      if (!signed) {
        falhas++;
        erros.push(`${t.nome}#${row.id}: signedUrl falhou pra ${path}`);
        continue;
      }
      const { error: errUpd } = await admin
        .from(t.nome)
        .update({ imagem_url: signed })
        .eq("id", row.id);
      if (errUpd) {
        falhas++;
        erros.push(`${t.nome}#${row.id}: update falhou ${errUpd.message}`);
        continue;
      }
      t.contador();
    }
  }

  return { produtosMigrados, categoriasMigradas, falhas, erros };
}

// =====================================================================
// Diagnostico — usado pelo botao de reparo pra mostrar info detalhada
// =====================================================================

export type DiagnosticoBucket = {
  bucketExiste: boolean;
  bucketPublico: boolean;
  totalArquivos: number | null;
  amostraUrlPublica: string | null;
  amostraUrlPublicaOk: boolean | null;
  amostraSignedUrl: string | null;
  amostraSignedUrlOk: boolean | null;
  produtosComUrlAntiga: number;
  categoriasComUrlAntiga: number;
  erros: string[];
};

export async function diagnosticarBucketCatalogo(): Promise<DiagnosticoBucket> {
  const erros: string[] = [];
  const out: DiagnosticoBucket = {
    bucketExiste: false,
    bucketPublico: false,
    totalArquivos: null,
    amostraUrlPublica: null,
    amostraUrlPublicaOk: null,
    amostraSignedUrl: null,
    amostraSignedUrlOk: null,
    produtosComUrlAntiga: 0,
    categoriasComUrlAntiga: 0,
    erros,
  };

  const admin = createSupabaseAdmin();

  // 1. Bucket
  try {
    const { data: b, error } = await admin.storage.getBucket(BUCKET_CATALOGO);
    if (error || !b) {
      erros.push(`getBucket: ${error?.message ?? "nao retornou dados"}`);
    } else {
      out.bucketExiste = true;
      out.bucketPublico = !!b.public;
    }
  } catch (e) {
    erros.push(`getBucket exception: ${(e as Error).message}`);
  }

  // 2. Lista arquivos (amostra)
  let amostraPath: string | null = null;
  try {
    const { data: lista, error } = await admin.storage
      .from(BUCKET_CATALOGO)
      .list("produtos", { limit: 1, sortBy: { column: "created_at", order: "desc" } });
    if (error) {
      erros.push(`list: ${error.message}`);
    } else if (lista && lista.length > 0) {
      amostraPath = `produtos/${lista[0].name}`;
      // tenta tambem contar total (best effort, sem paginar tudo)
      const { data: total } = await admin.storage
        .from(BUCKET_CATALOGO)
        .list("produtos", { limit: 1000 });
      out.totalArquivos = total?.length ?? null;
    } else {
      out.totalArquivos = 0;
    }
  } catch (e) {
    erros.push(`list exception: ${(e as Error).message}`);
  }

  // 3. Testa amostra (public + signed)
  if (amostraPath) {
    const { data: pub } = admin.storage.from(BUCKET_CATALOGO).getPublicUrl(amostraPath);
    out.amostraUrlPublica = pub.publicUrl;
    out.amostraUrlPublicaOk = await urlAcessivel(pub.publicUrl);

    const signed = await gerarSignedUrlLongaCatalogo(amostraPath);
    out.amostraSignedUrl = signed;
    out.amostraSignedUrlOk = signed ? await urlAcessivel(signed) : false;
  }

  // 4. URLs antigas no banco
  try {
    for (const tabela of ["produtos", "categorias"] as const) {
      const { count, error } = await admin
        .from(tabela)
        .select("id", { count: "exact", head: true })
        .like("imagem_url", "%/storage/v1/object/public/catalogo/%");
      if (error) {
        erros.push(`count ${tabela}: ${error.message}`);
      } else if (typeof count === "number") {
        if (tabela === "produtos") out.produtosComUrlAntiga = count;
        else out.categoriasComUrlAntiga = count;
      }
    }
  } catch (e) {
    erros.push(`count exception: ${(e as Error).message}`);
  }

  return out;
}
