import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ShieldCheck, Star, Truck } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { SafeProductImage } from "@/components/SafeProductImage";
import { ProductActions } from "./product-actions";
import { buscarProduto, listarProdutos, relacionadosDe } from "@/lib/data";
import { imagemProduto } from "@/lib/imagens";
import { calcDesconto, fmtPreco, MINUTOS_ENTREGA, precoFinal } from "@/lib/utils";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const produtos = await listarProdutos();
  return produtos.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await buscarProduto(params.slug);
  if (!p) return { title: "Produto não encontrado — Zé Chegou 24h" };
  return {
    title: `${p.name.trim()} — Zé Chegou 24h`,
    description: (p.description ?? "").trim() || `${p.name.trim()} - Entrega 24h.`,
  };
}

export default async function ProdutoPage({ params }: { params: { slug: string } }) {
  const produto = await buscarProduto(params.slug);
  if (!produto) notFound();

  const desconto = calcDesconto(produto.price, produto.promoPrice);
  const preco = precoFinal(produto.price, produto.promoPrice);
  const cat = produto.category;
  const relacionados = await relacionadosDe(produto, 8);
  const img = imagemProduto(produto);

  return (
    <>
      <Header />
      <main className="flex-1">
        <div className="px-4 pt-3 pb-1">
          <Link
            href={cat ? `/produtos?category=${encodeURIComponent(cat.slug)}` : "/produtos"}
            className="inline-flex items-center gap-1 text-xs text-gray-500 active:text-brand-dark"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </Link>
        </div>

        <div className="relative aspect-square bg-gray-50 mx-4 rounded-xl overflow-hidden">
          <SafeProductImage
            src={img}
            alt={produto.name}
            fill
            sizes="(max-width: 768px) 92vw, 760px"
            className="object-contain p-6"
            priority
          />
          {desconto > 0 && (
            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-brand-red text-white text-xs font-bold">
              -{desconto}%
            </span>
          )}
        </div>

        <div className="px-4 pt-4 pb-6">
          {cat && (
            <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-0.5">{cat.name}</p>
          )}
          <h1 className="font-extrabold text-xl text-brand-dark tracking-tight leading-tight font-display">
            {produto.name}
          </h1>

          <div className="flex items-center gap-0.5 mt-2 mb-3">
            {[1, 2, 3, 4].map((i) => (
              <Star key={i} className="w-3.5 h-3.5 text-brand-yellow fill-brand-yellow" />
            ))}
            <Star className="w-3.5 h-3.5 text-gray-200" />
            <span className="text-xs text-gray-500 ml-1">(4.2) · avaliações</span>
          </div>

          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              {produto.price && produto.promoPrice && produto.price > produto.promoPrice && (
                <span className="text-sm text-gray-400 line-through">{fmtPreco(produto.price)}</span>
              )}
              <span className="font-extrabold text-2xl text-brand-dark">{fmtPreco(preco)}</span>
            </div>
          </div>

          {(produto.description ?? "").trim() && (
            <div className="mb-4">
              <h3 className="font-semibold text-sm text-brand-dark mb-1">Descrição</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{produto.description}</p>
            </div>
          )}

          <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-none">
            {cat && (
              <div className="flex-shrink-0 p-2.5 rounded-xl bg-brand-gray min-w-[100px]">
                <p className="text-xs uppercase tracking-wider text-gray-400">Categoria</p>
                <p className="text-sm font-semibold text-brand-dark">{cat.name}</p>
              </div>
            )}
            {produto.volume && (
              <div className="flex-shrink-0 p-2.5 rounded-xl bg-brand-gray min-w-[100px]">
                <p className="text-xs uppercase tracking-wider text-gray-400">Volume</p>
                <p className="text-sm font-semibold text-brand-dark">{produto.volume}</p>
              </div>
            )}
            {produto.brand && (
              <div className="flex-shrink-0 p-2.5 rounded-xl bg-brand-gray min-w-[100px]">
                <p className="text-xs uppercase tracking-wider text-gray-400">Marca</p>
                <p className="text-sm font-semibold text-brand-dark">{produto.brand}</p>
              </div>
            )}
          </div>

          <div className="flex gap-4 mb-5">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Truck className="w-3.5 h-3.5 text-brand-yellow" />
              Até {MINUTOS_ENTREGA} min
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-yellow" />
              100% seguro
            </div>
          </div>

          <ProductActions produto={produto} />
        </div>

        {relacionados.length > 0 && (
          <section className="py-5 bg-brand-gray">
            <div className="px-4 mb-3">
              <h2 className="font-extrabold text-base text-brand-dark font-display">Produtos Relacionados</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 px-4">
              {relacionados.map((p) => (
                <div key={p.id} className="flex-shrink-0 w-[140px]">
                  <ProductCard produto={p} />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
