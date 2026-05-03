import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { listarCategoriasPublicadas, listarProdutos } from "@/lib/data";
import { UpsellClient } from "./upsell-client";

export const metadata = {
  title: "Cupom 50% OFF — Zé Chegou 24h",
  robots: { index: false, follow: false },
};

export const revalidate = 300;

export default async function UpsellPage() {
  const [categorias, produtos] = await Promise.all([
    listarCategoriasPublicadas(),
    listarProdutos(),
  ]);

  // Mesma agrupacao da home, em ordem
  const secoes = categorias
    .map((c) => ({
      cat: c,
      produtos: produtos
        .filter((p) => p.category?.slug === c.slug)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    }))
    .filter((s) => s.produtos.length > 0);

  return (
    <>
      <Header />
      <main className="flex-1">
        <UpsellClient secoes={secoes} />
      </main>
      <Footer />
    </>
  );
}
