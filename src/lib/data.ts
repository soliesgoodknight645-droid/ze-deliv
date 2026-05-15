import "server-only";
import { unstable_cache } from "next/cache";
import catalogoJson from "@/data/catalogo.json";
import imagensRaw from "@/data/imagens-produtos.json";
import imagensCategoriasRaw from "@/data/imagens-categorias.json";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { Categoria, Produto } from "./types";

const mapaImagens = imagensRaw as Record<string, string>;
const mapaImagensCategorias = imagensCategoriasRaw as Record<string, string>;

/** Catálogo versionado (slug → URL https). Em produção o prebuild zera o mapa de public/products; isso evita 404 em /products/*. */
type LinhaCatalogo = { slug?: string | null; imageUrl?: string | null };
let _imagemPorSlugCatalogo: ReadonlyMap<string, string> | null = null;

function imagemCatalogoPorSlug(slug: string): string | null {
  if (!_imagemPorSlugCatalogo) {
    const m = new Map<string, string>();
    for (const row of catalogoJson as LinhaCatalogo[]) {
      const s = row.slug?.trim();
      const u = row.imageUrl?.trim();
      if (!s || !u || !/^https?:\/\//i.test(u)) continue;
      if (!m.has(s)) m.set(s, u);
    }
    _imagemPorSlugCatalogo = m;
  }
  return _imagemPorSlugCatalogo.get(slug) ?? null;
}

// =============================================================
// HELPERS
// =============================================================

function urlImagemCategoria(c: { slug: string; imagem_url: string | null }): string | null {
  if (c.imagem_url) {
    if (/^https?:\/\//i.test(c.imagem_url)) return c.imagem_url;
    if (c.imagem_url.startsWith("/")) {
      const m = /\/categories\/([^.]+)\.[a-z]+$/i.exec(c.imagem_url);
      if (m && mapaImagensCategorias[m[1]]) return mapaImagensCategorias[m[1]];
    }
    if (c.imagem_url.startsWith("/")) return c.imagem_url;
  }
  if (mapaImagensCategorias[c.slug]) return mapaImagensCategorias[c.slug];
  const slugUnderline = c.slug.replace(/-/g, "_");
  if (mapaImagensCategorias[slugUnderline]) return mapaImagensCategorias[slugUnderline];
  return null;
}

// Cache lazy de indices pra acelerar busca por similaridade.
// _indiceRaiz: raiz exata -> primeira url
// _tokensPorUrl: lista [{ tokens, url }] pra fuzzy match por overlap
let _indiceRaiz: Map<string, string> | null = null;
let _tokensPorUrl: Array<{ tokens: string[]; url: string }> | null = null;

function construirIndices() {
  const raizMap = new Map<string, string>();
  const tokensList: Array<{ tokens: string[]; url: string }> = [];
  for (const [k, v] of Object.entries(mapaImagens)) {
    const raiz = raizSlug(k);
    if (raiz && !raizMap.has(raiz)) raizMap.set(raiz, v);
    const toks = tokensDeSlug(k);
    if (toks.length >= 2) tokensList.push({ tokens: toks, url: v });
  }
  _indiceRaiz = raizMap;
  _tokensPorUrl = tokensList;
}

function indiceRaizImagens(): Map<string, string> {
  if (!_indiceRaiz) construirIndices();
  return _indiceRaiz!;
}
function tokensIndex(): Array<{ tokens: string[]; url: string }> {
  if (!_tokensPorUrl) construirIndices();
  return _tokensPorUrl!;
}

// Palavras que nao identificam o produto (ruido pra match por tokens).
const STOP = new Set([
  "kit", "combo", "lata", "long", "neck", "barril", "ml", "l", "kg", "g",
  "un", "unidades", "litros", "litro", "pack", "com", "de", "do", "da",
  "e", "para", "no", "a", "o", "ate",
  "express", "gelado", "entrega", "rapida", "rapido", "delivery", "so",
  "novo", "premium", "tradicional", "original", "fresh", "bebida", "composta",
  "serve", "pessoas",
]);

function tokensDeSlug(slug: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of slug.split(/-+/)) {
    if (!w || w.length < 2) continue;
    if (STOP.has(w)) continue;
    if (/^\d+$/.test(w)) continue;
    // Remove tokens que sao volume/quantidade (ex: 750ml, 1l, 2-5kg, 12anos, 4kg)
    if (/^\d+(?:[._-]\d+)?(?:ml|l|kg|g|un|unidades|anos|cm)$/i.test(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

/**
 * Reduz um slug a sua "raiz" pra permitir match entre variantes do mesmo produto.
 * Remove sufixos comuns: id numerico no final (-628), volume (-275ml, -750ml, -1l),
 * pack (-pack-com-12), variacoes logisticas (entrega/gelado/express/rapido)
 * e prefixos comuns (kit-/combo-).
 */
function raizSlug(slug: string): string {
  return slug
    .replace(/^(?:kit|combo)-/g, "")
    .replace(/-\d+$/g, "")
    .replace(/-\d+-unidades?\b/g, "")
    .replace(/-(?:\d+(?:[._-]\d+)?)(?:ml|l|kg|g|un|unidades|litros)\b/g, "")
    .replace(/-pack-com-\d+/g, "")
    .replace(/-caixa-com-\d+/g, "")
    .replace(/-(?:entrega|gelado|express|rapido|rapida|delivery|so-barril)\b/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Fuzzy match: retorna a URL cuja "intersecao de palavras" com o slug alvo
 * for maior. Combina Jaccard (para slugs de tamanho parecido) com Containment
 * (parte do menor que cabe no maior). Threshold combinado em 0.5.
 */

/** Nome do arquivo (sem extensao) a partir de `/products/foo.jpg` */
function stemArquivoProducts(imagemUrl: string): string | null {
  if (!imagemUrl.startsWith("/products/")) return null;
  const fn = imagemUrl.slice("/products/".length).split("/").pop() ?? "";
  if (!fn) return null;
  const dot = fn.lastIndexOf(".");
  return dot > 0 ? fn.slice(0, dot) : fn;
}

/** Só aceita caminho local se existir arquivo real no mapa gerado em public/products */
function urlLocalProductsValida(imagemUrl: string | null): string | null {
  if (!imagemUrl?.startsWith("/products/")) return null;
  const stem = stemArquivoProducts(imagemUrl);
  if (!stem) return null;
  const canonical = mapaImagens[stem];
  return canonical ?? null;
}

function urlPorTokens(slug: string): string | null {
  const alvo = tokensDeSlug(slug);
  if (alvo.length < 2) return null;
  const alvoSet = new Set(alvo);
  // Ranqueamento: (1) mais tokens em comum, (2) maior Jaccard.
  // Aceita se Jaccard >=0.4 OU containment (inter/min(a,b)) >= 0.66.
  let melhor: { inter: number; jaccard: number; url: string } | null = null;
  for (const cand of tokensIndex()) {
    let inter = 0;
    for (const t of cand.tokens) if (alvoSet.has(t)) inter++;
    if (inter < 2) continue;
    const uni = alvo.length + cand.tokens.length - inter;
    const jaccard = inter / uni;
    const contain = inter / Math.min(alvo.length, cand.tokens.length);
    if (!(jaccard >= 0.4 || contain >= 0.66)) continue;
    const melhorAtual =
      !melhor ||
      inter > melhor.inter ||
      (inter === melhor.inter && jaccard > melhor.jaccard);
    if (melhorAtual) {
      melhor = { inter, jaccard, url: cand.url };
    }
  }
  return melhor?.url ?? null;
}

export function urlImagemProduto(slug: string, imagemUrl: string | null): string | null {
  if (imagemUrl) {
    // URL absoluta (https://...)
    if (/^https?:\/\//i.test(imagemUrl)) return imagemUrl;
    // URL do nosso proxy de imagem (relativa) — funciona tanto em dev
    // quanto em prod, independente do NEXT_PUBLIC_SITE_URL
    if (imagemUrl.startsWith("/api/imagem-storage/")) return imagemUrl;
  }

  const catalogo = imagemCatalogoPorSlug(slug);
  if (catalogo) return catalogo;

  // Caminho salvo no banco (/products/...) só vale se o arquivo existir em disco
  const localDoBanco = urlLocalProductsValida(imagemUrl);
  if (localDoBanco) return localDoBanco;

  // 1) Match exato no mapa local (slug = nome do arquivo)
  if (mapaImagens[slug]) return mapaImagens[slug];

  // 2) Match por raiz (variantes de mesmo produto: id/volume/pack diferentes)
  const raiz = raizSlug(slug);
  if (raiz) {
    const similar = indiceRaizImagens().get(raiz);
    if (similar) return similar;
  }

  // 3) Fuzzy match por overlap de tokens (cobre slugs com prefixos diferentes,
  //    ex: "vodka-mansao-maromba-..." vs "bebida-composta-mansao-maromba-vodka-...")
  const fuzzy = urlPorTokens(slug);
  if (fuzzy) return fuzzy;

  // Não devolver caminho quebrado — imagemProduto cai no placeholder
  return null;
}

function mapearCategoria(row: Record<string, unknown>): Categoria {
  return {
    id: row.id as string,
    name: row.nome as string,
    slug: row.slug as string,
    description: (row.descricao as string) || null,
    icon: (row.icone as string) || null,
    imageUrl: urlImagemCategoria({ slug: row.slug as string, imagem_url: (row.imagem_url as string) || null }),
    sortOrder: (row.ordem as number) ?? 0,
    createdAt: row.criado_em as string,
    updatedAt: row.atualizado_em as string,
  };
}

function mapearProduto(row: Record<string, unknown>, categoriasPorId?: Map<string, Categoria>): Produto {
  const slug = row.slug as string;
  const cat = categoriasPorId?.get(row.categoria_id as string) ?? null;
  return {
    id: row.id as string,
    name: (row.nome as string) || "",
    slug,
    description: (row.descricao as string) || null,
    brand: (row.marca as string) || null,
    volume: (row.volume as string) || null,
    alcoholContent: (row.teor_alcoolico as string) || null,
    temperature: (row.temperatura as string) || null,
    price: row.preco != null ? Number(row.preco) : null,
    promoPrice: row.preco_promocional != null ? Number(row.preco_promocional) : null,
    imageUrl: urlImagemProduto(slug, (row.imagem_url as string) || null),
    inStock: (row.em_estoque as boolean) ?? true,
    featured: (row.destaque as boolean) ?? false,
    bestSeller: (row.mais_vendido as boolean) ?? false,
    isNew: (row.novo as boolean) ?? false,
    sortOrder: (row.ordem as number) ?? 0,
    categoryId: row.categoria_id as string,
    createdAt: row.criado_em as string,
    updatedAt: row.atualizado_em as string,
    category: cat,
  };
}

// =============================================================
// FETCHERS (com cache do Next, invalidados via revalidateTag)
// =============================================================

const carregarTudo = unstable_cache(
  async () => {
    const sb = createSupabaseAdmin();
    const [{ data: cats, error: errCats }, { data: prods, error: errProds }] = await Promise.all([
      sb.from("categorias").select("*").order("ordem", { ascending: true }),
      sb.from("produtos").select("*").order("ordem", { ascending: true }),
    ]);
    if (errCats) throw new Error(`categorias: ${errCats.message}`);
    if (errProds) throw new Error(`produtos: ${errProds.message}`);

    const categorias = (cats ?? []).map(mapearCategoria);
    const catsPorId = new Map(categorias.map((c) => [c.id, c]));
    const produtos = (prods ?? []).map((p) => mapearProduto(p, catsPorId));
    return { categorias, produtos };
  },
  ["catalogo:tudo"],
  { tags: ["catalogo"], revalidate: 300 },
);

// =============================================================
// API publica (mesma interface de antes, agora async)
// =============================================================

export async function listarCategorias(): Promise<Categoria[]> {
  const { categorias } = await carregarTudo();
  return categorias;
}

export async function listarCategoriasPublicadas(): Promise<Categoria[]> {
  return (await listarCategorias()).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function listarProdutos(): Promise<Produto[]> {
  const { produtos } = await carregarTudo();
  return produtos;
}

export async function buscarProduto(slug: string): Promise<Produto | undefined> {
  const { produtos } = await carregarTudo();
  return produtos.find((p) => p.slug === slug);
}

export async function buscarCategoria(slug: string): Promise<Categoria | undefined> {
  const { categorias } = await carregarTudo();
  return categorias.find((c) => c.slug === slug);
}

export async function produtosDaCategoria(slugCategoria: string): Promise<Produto[]> {
  const { produtos } = await carregarTudo();
  return produtos
    .filter((p) => p.category?.slug === slugCategoria)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function relacionadosDe(produto: Produto, max = 8): Promise<Produto[]> {
  if (!produto.category) return [];
  const { produtos } = await carregarTudo();
  return produtos
    .filter((p) => p.category?.slug === produto.category?.slug && p.slug !== produto.slug)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .slice(0, max);
}

export async function destaques(max = 12): Promise<Produto[]> {
  const { produtos } = await carregarTudo();
  return produtos
    .filter((p) => p.bestSeller || p.featured)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .slice(0, max);
}

export async function ofertas(max = 12): Promise<Produto[]> {
  const { produtos } = await carregarTudo();
  return produtos
    .filter((p) => p.price && p.promoPrice && (p.promoPrice as number) < (p.price as number))
    .sort((a, b) => {
      const da = (a.price! - a.promoPrice!) / a.price!;
      const db = (b.price! - b.promoPrice!) / b.price!;
      return db - da;
    })
    .slice(0, max);
}

