"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { fmtPreco } from "@/lib/utils";

const ROTAS_OCULTAS = ["/carrinho", "/checkout", "/admin", "/pedido", "/upsell"];

export function FloatingCartBar() {
  const { itens, totalValor, totalItens, pronto, abrirDrawer } = useCart();
  const pathname = usePathname();

  if (!pronto) return null;
  if (totalItens === 0) return null;
  if (ROTAS_OCULTAS.some((r) => pathname?.startsWith(r))) return null;

  const previews = itens.slice(0, 3);

  return (
    <div className="fixed bottom-3 left-3 right-3 z-30 mx-auto max-w-md animate-slide-up">
      <button
        type="button"
        onClick={abrirDrawer}
        className="w-full bg-white rounded-2xl shadow-2xl border border-gray-100 px-3 py-2.5 flex items-center gap-3 active:scale-[0.99] transition-transform"
      >
        <div className="flex -space-x-2">
          {previews.map((i) => (
            <div
              key={i.produtoId}
              className="relative w-10 h-10 rounded-lg bg-brand-gray overflow-hidden ring-2 ring-white"
            >
              {i.imagem && (
                <Image src={i.imagem} alt={i.nome} fill sizes="40px" className="object-contain p-0.5" />
              )}
            </div>
          ))}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-xs font-bold text-brand-dark leading-tight">
            {totalItens} {totalItens === 1 ? "ITEM NO" : "ITENS NO"} CARRINHO
          </p>
          <p className="text-base font-extrabold text-brand-dark leading-tight">{fmtPreco(totalValor)}</p>
        </div>
        <span className="inline-flex items-center gap-1 h-10 px-3 rounded-full bg-brand-yellow text-brand-dark text-xs font-extrabold flex-shrink-0">
          VER CARRINHO <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </button>
    </div>
  );
}
