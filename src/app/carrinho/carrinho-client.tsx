"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCart } from "@/contexts/CartContext";
import { mensagemErroPedidoMinimo, PEDIDO_MINIMO_REAIS, subtotalAbaixoDoMinimo } from "@/lib/pedido-minimo";
import {
  calcularFrete,
  faltaParaFreteGratis,
  LIMITE_FRETE_GRATIS,
  temFreteGratis,
} from "@/lib/frete";
import { fmtPreco } from "@/lib/utils";

export function CarrinhoClient() {
  const router = useRouter();
  const { itens, totalValor, alterarQtd, remover, pronto } = useCart();

  if (!pronto) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <main className="flex-1 px-4 pt-6 pb-6 max-w-screen-md mx-auto w-full">
        <h1 className="font-extrabold text-xl text-brand-dark mb-5">Seu Carrinho</h1>

        {itens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingCart className="w-16 h-16 text-gray-200 mb-4" />
            <p className="font-semibold text-lg text-brand-dark">Carrinho vazio</p>
            <p className="text-sm text-gray-400 mt-2">Adicione bebidas para começar!</p>
            <Link
              href="/produtos"
              className="mt-6 h-12 px-8 rounded-full font-bold text-sm text-brand-dark bg-brand-yellow active:scale-95 transition-transform inline-flex items-center"
            >
              Ver Produtos
            </Link>
          </div>
        ) : (
          <>
            <ul className="space-y-3 mb-5">
              {itens.map((item) => (
                <li key={item.produtoId} className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
                  <div className="flex gap-3">
                    <div className="w-20 h-20 rounded-xl bg-brand-gray relative flex-shrink-0 overflow-hidden border border-gray-100">
                      {item.imagem && (
                        <Image src={item.imagem} alt={item.nome} fill sizes="80px" className="object-contain p-1.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm text-brand-dark leading-tight line-clamp-2 pr-1">
                          {item.nome}
                        </h3>
                        <button
                          type="button"
                          onClick={() => remover(item.produtoId)}
                          aria-label="Remover item"
                          className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 active:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>
                      <p className="text-sm font-extrabold mt-0.5 text-brand-dark">{fmtPreco(item.precoUnitario)}</p>
                      <div className="flex items-center justify-end gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => alterarQtd(item.produtoId, -1)}
                          aria-label="Diminuir"
                          className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center active:bg-gray-100"
                        >
                          <Minus className="w-3.5 h-3.5 text-[#333]" />
                        </button>
                        <span className="text-sm font-bold w-6 text-center">{item.quantidade}</span>
                        <button
                          type="button"
                          onClick={() => alterarQtd(item.produtoId, 1)}
                          aria-label="Aumentar"
                          className="w-8 h-8 rounded-lg flex items-center justify-center active:opacity-80 bg-brand-yellow"
                        >
                          <Plus className="w-3.5 h-3.5 text-brand-dark" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-semibold text-brand-dark">{fmtPreco(totalValor)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Entrega</span>
                {temFreteGratis(totalValor) ? (
                  <span className="font-semibold text-brand-green">Grátis</span>
                ) : (
                  <span className="font-semibold text-brand-dark">
                    {fmtPreco(calcularFrete(totalValor))}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <span className="font-bold text-brand-dark">Total</span>
                <span className="font-extrabold text-lg text-brand-red">
                  {fmtPreco(totalValor + calcularFrete(totalValor))}
                </span>
              </div>
              {!subtotalAbaixoDoMinimo(totalValor) && !temFreteGratis(totalValor) && (
                <p className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
                  Falta{" "}
                  <span className="font-bold">
                    {fmtPreco(faltaParaFreteGratis(totalValor))}
                  </span>{" "}
                  pra ganhar frete grátis (mínimo {fmtPreco(LIMITE_FRETE_GRATIS)}).
                </p>
              )}
              {subtotalAbaixoDoMinimo(totalValor) && (
                <p className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
                  Pedido mínimo {fmtPreco(PEDIDO_MINIMO_REAIS)}. Faltam{" "}
                  <span className="font-bold">
                    {fmtPreco(Math.max(0, PEDIDO_MINIMO_REAIS - totalValor))}
                  </span>{" "}
                  para continuar.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (subtotalAbaixoDoMinimo(totalValor)) {
                  toast.error(mensagemErroPedidoMinimo());
                  return;
                }
                router.push("/checkout");
              }}
              className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-sm bg-brand-yellow text-brand-dark"
            >
              Continuar <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
