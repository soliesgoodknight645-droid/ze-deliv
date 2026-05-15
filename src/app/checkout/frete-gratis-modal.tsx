"use client";

import { useEffect } from "react";
import { ArrowRight, ShoppingBag, Truck, X } from "lucide-react";
import { fmtPreco } from "@/lib/utils";

// =====================================================================
// Modal "Falta R$X pra frete gratis" — aparece quando o cliente vai
// avancar pra etapa de pagamento com subtotal abaixo do limite.
// O cliente decide:
//   - "Adicionar mais itens" -> volta pro catalogo
//   - "Continuar e pagar frete" -> segue pro pagamento, frete eh cobrado
// =====================================================================

type Props = {
  faltam: number;
  taxaFrete: number;
  limiteFreteGratis: number;
  onContinuarMesmoAssim: () => void;
  onAdicionarMaisItens: () => void;
  onFechar: () => void;
};

export function FreteGratisModal({
  faltam,
  taxaFrete,
  limiteFreteGratis,
  onContinuarMesmoAssim,
  onAdicionarMaisItens,
  onFechar,
}: Props) {
  // Fecha com ESC + trava o scroll
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", onKey);
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = orig;
    };
  }, [onFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="frete-modal-titulo"
    >
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="relative px-5 pt-6 pb-3">
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 p-1"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-14 h-14 rounded-2xl bg-brand-yellow/20 flex items-center justify-center mb-3">
            <Truck className="w-7 h-7 text-brand-dark" />
          </div>
          <h2
            id="frete-modal-titulo"
            className="text-[20px] font-extrabold text-brand-dark leading-snug"
          >
            Falta {fmtPreco(faltam)} pra ganhar frete grátis!
          </h2>
        </div>

        {/* Body */}
        <div className="px-5 pb-3 flex-1 overflow-y-auto">
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            Pedidos a partir de <strong>{fmtPreco(limiteFreteGratis)}</strong>{" "}
            ganham entrega grátis. Se preferir continuar agora, vamos cobrar uma
            taxa de <strong>{fmtPreco(taxaFrete)}</strong> pelo frete.
          </p>

          {/* Barra de progresso visual */}
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
              <span>Subtotal atual</span>
              <span>Frete grátis</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-brand-yellow transition-all"
                style={{
                  width: `${Math.min(100, ((limiteFreteGratis - faltam) / limiteFreteGratis) * 100)}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-sm">
              <span className="font-bold text-brand-dark">
                {fmtPreco(Math.max(0, limiteFreteGratis - faltam))}
              </span>
              <span className="font-bold text-brand-dark">
                {fmtPreco(limiteFreteGratis)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer com CTAs */}
        <div className="px-5 pb-5 pt-2 border-t border-gray-100 flex flex-col gap-2 bg-gray-50/40">
          <button
            type="button"
            onClick={onAdicionarMaisItens}
            className="w-full h-12 rounded-2xl font-extrabold text-sm bg-brand-yellow text-brand-dark active:scale-[0.98] transition-transform inline-flex items-center justify-center gap-2"
          >
            <ShoppingBag className="w-4 h-4" /> Adicionar mais itens
          </button>
          <button
            type="button"
            onClick={onContinuarMesmoAssim}
            className="w-full h-12 rounded-2xl font-bold text-sm border border-gray-200 text-gray-700 active:scale-[0.98] transition-transform inline-flex items-center justify-center gap-2"
          >
            Continuar e pagar {fmtPreco(taxaFrete)} de frete{" "}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
