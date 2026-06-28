import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { FooterGasAgua } from "@/components/FooterGasAgua";
import { listarProdutos } from "@/lib/data";
import type { Produto } from "@/lib/types";
import { calcDesconto, precoFinal } from "@/lib/utils";
import { GasVendasClient } from "./gas-vendas-client";

// Landing de VENDAS de gas (carro-chefe) + agua como complemento.
// Diferente da /gaseagua (institucional): aqui o foco eh conversao —
// hero com produto + preco + CTA, urgencia, prova social e FAQ.
// Sem age-gate (so gas/agua, nada de alcool) — ver AgeGate.tsx.

export const metadata: Metadata = {
  title: "Gás a Domicílio em até 30 min — Zé Express | Botijão P13",
  description:
    "Acabou o gás? Peça seu botijão P13 das melhores marcas com entrega em até 30 minutos. Pague no PIX ou na entrega. Atendemos 24h em Palmeira dos Índios/AL.",
  alternates: { canonical: "/gas" },
  openGraph: {
    title: "Gás a domicílio em até 30 min — Zé Express",
    description:
      "Botijão P13 com entrega rápida. PIX ou pagamento na entrega. 24h.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const revalidate = 300;

const SLUG_GAS = "agua-e-gas";
const SLUG_AGUAS_GELO = "aguas-e-gelo";

function ehP13(p: Produto): boolean {
  return p.slug.toLowerCase().includes("p13");
}
function ehP5(p: Produto): boolean {
  return p.slug.toLowerCase().includes("p5");
}
function ehGarrafao(p: Produto): boolean {
  return /garrafao|galao|20l/.test(p.slug.toLowerCase());
}

export default async function GasPage() {
  const produtos = await listarProdutos();

  const gasCat = produtos.filter(
    (p) => p.category?.slug === SLUG_GAS && p.inStock !== false,
  );

  const botijoesP13 = gasCat
    .filter(ehP13)
    .sort(
      (a, b) =>
        precoFinal(a.price, a.promoPrice) - precoFinal(b.price, b.promoPrice),
    );

  const outrosGas = gasCat.filter(ehP5);

  // Água como complemento: só os itens "grandes" (garrafões/galões 20L),
  // que combinam com a compra de gás. Tira água individual/pack pequeno.
  const aguas = [
    ...gasCat.filter((p) => !ehP13(p) && !ehP5(p) && ehGarrafao(p)),
    ...produtos.filter(
      (p) =>
        p.category?.slug === SLUG_AGUAS_GELO &&
        ehGarrafao(p) &&
        p.inStock !== false,
    ),
  ];

  // Hero: o botijão P13 com maior desconto; empate -> menor preço final.
  const heroGas =
    [...botijoesP13].sort((a, b) => {
      const da = calcDesconto(a.price, a.promoPrice);
      const db = calcDesconto(b.price, b.promoPrice);
      if (db !== da) return db - da;
      return (
        precoFinal(a.price, a.promoPrice) - precoFinal(b.price, b.promoPrice)
      );
    })[0] ?? null;

  return (
    <>
      <Header />
      <GasVendasClient
        heroGas={heroGas}
        botijoesP13={botijoesP13}
        outrosGas={outrosGas}
        aguas={aguas}
      />
      <FooterGasAgua />
    </>
  );
}
