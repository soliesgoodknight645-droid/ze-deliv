import Link from "next/link";
import { ChevronRight, Plus, Search } from "lucide-react";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { urlImagemProduto } from "@/lib/data";
import { imagemProduto } from "@/lib/imagens";
import { fmtPreco } from "@/lib/utils";
import { SafeProductImage } from "@/components/SafeProductImage";
import { ProdutosReorderClient } from "./reorder-client";
import { RepararBucketButton } from "./reparar-bucket-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Produtos — Zé Chegou 24h", robots: { index: false } };

const PAGE_SIZE = 50;

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams?: { q?: string; cat?: string; page?: string; reordenar?: string };
}) {
  const q = (searchParams?.q ?? "").trim();
  const cat = searchParams?.cat ?? "todas";
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const reordenar = searchParams?.reordenar === "1" && cat !== "todas";

  const admin = createSupabaseAdmin();
  const { data: categorias } = await admin
    .from("categorias")
    .select("id, nome, slug")
    .order("ordem", { ascending: true });

  // Modo reordenar: pega TODOS da categoria sem paginação
  if (reordenar) {
    const { data: prods } = await admin
      .from("produtos")
      .select("id, nome, slug, imagem_url, preco, preco_promocional, ordem, em_estoque, publicado")
      .eq("categoria_id", cat)
      .order("ordem", { ascending: true });

    const catNome = categorias?.find((c) => c.id === cat)?.nome ?? "?";

    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-extrabold text-2xl text-brand-dark">Reordenar: {catNome}</h1>
          <Link
            href={`/admin/produtos?cat=${cat}`}
            className="text-sm text-gray-500 hover:text-brand-dark"
          >
            Cancelar
          </Link>
        </div>
        <ProdutosReorderClient produtos={prods ?? []} />
      </div>
    );
  }

  let query = admin
    .from("produtos")
    .select("id, nome, slug, imagem_url, preco, preco_promocional, em_estoque, publicado, destaque, mais_vendido, categoria_id", { count: "exact" })
    .order("ordem", { ascending: true });

  if (cat !== "todas") query = query.eq("categoria_id", cat);
  if (q) query = query.or(`nome.ilike.%${q}%,slug.ilike.%${q}%,marca.ilike.%${q}%`);

  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data: prods, count } = await query;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const catsPorId = new Map((categorias ?? []).map((c) => [c.id, c.nome]));

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-extrabold text-2xl text-brand-dark">Produtos</h1>
          <p className="text-sm text-gray-500">
            {total.toLocaleString("pt-BR")} produto{total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RepararBucketButton />
          <Link
            href="/admin/produtos/novo"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-bold bg-brand-yellow text-brand-dark active:scale-95"
          >
            <Plus className="w-4 h-4" /> Novo
          </Link>
        </div>
      </div>

      <form
        action="/admin/produtos"
        method="get"
        className="bg-white rounded-2xl p-3 mb-4 shadow-sm flex flex-col sm:flex-row gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome, slug ou marca..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
          />
        </div>
        <select
          name="cat"
          defaultValue={cat}
          className="h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
        >
          <option value="todas">Todas as categorias</option>
          {categorias?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-10 px-4 rounded-lg text-xs font-bold bg-brand-yellow text-brand-dark active:scale-95"
        >
          Buscar
        </button>
      </form>

      {cat !== "todas" && (
        <div className="mb-4 flex items-center justify-between text-xs">
          <span className="text-gray-500">
            Filtrando por: <strong>{catsPorId.get(cat) ?? "?"}</strong>
          </span>
          <Link
            href={`/admin/produtos?cat=${cat}&reordenar=1`}
            className="font-bold text-brand-dark hover:underline"
          >
            Reordenar produtos desta categoria →
          </Link>
        </div>
      )}

      <ul className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">
        {(prods ?? []).map((p) => {
          const precoExibido = p.preco_promocional ?? p.preco;
          const thumb = imagemProduto({
            slug: p.slug,
            imageUrl: urlImagemProduto(p.slug, (p.imagem_url as string | null) ?? null) ?? null,
          });
          return (
            <li key={p.id}>
              <Link
                href={`/admin/produtos/${p.id}`}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50/50"
              >
                <div className="w-12 h-12 rounded-lg bg-gray-100 relative flex-shrink-0 overflow-hidden flex items-center justify-center">
                  <SafeProductImage src={thumb} alt={p.nome} fill sizes="48px" className="object-contain p-1" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-brand-dark truncate">{p.nome}</p>
                    {!p.publicado && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">
                        oculto
                      </span>
                    )}
                    {!p.em_estoque && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 flex-shrink-0">
                        sem estoque
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {catsPorId.get(p.categoria_id as string) ?? "?"} · /{p.slug}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-sm text-brand-dark">
                    {precoExibido != null ? fmtPreco(Number(precoExibido)) : "—"}
                  </p>
                  {p.preco_promocional != null && p.preco != null && p.preco > p.preco_promocional && (
                    <p className="text-[10px] text-gray-400 line-through">{fmtPreco(Number(p.preco))}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </Link>
            </li>
          );
        })}
        {prods?.length === 0 && (
          <li className="text-center text-sm text-gray-500 py-12">Nenhum produto encontrado.</li>
        )}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4 text-xs">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((p) => {
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (cat !== "todas") params.set("cat", cat);
            params.set("page", String(p));
            return (
              <Link
                key={p}
                href={`/admin/produtos?${params.toString()}`}
                className={`min-w-8 h-8 px-2 rounded-md font-bold inline-flex items-center justify-center ${
                  p === page ? "bg-brand-yellow text-brand-dark" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                }`}
              >
                {p}
              </Link>
            );
          })}
          {totalPages > 10 && <span className="text-gray-400">...</span>}
        </div>
      )}
    </div>
  );
}
