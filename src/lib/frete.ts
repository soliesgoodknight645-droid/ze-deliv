import { fmtPreco } from "@/lib/utils";

// =====================================================================
// Regras de frete
//
// Politica atual (06/05/2026): R$ 5,00 fixo abaixo do limite de
// frete gratis; gratis a partir de R$ 20,00 de subtotal.
//
// Se algum dia for ter frete por bairro/cep, esse arquivo eh o ponto
// unico de mudanca (todo o checkout/carrinho/upsell consulta daqui).
// =====================================================================

/** Taxa fixa cobrada quando o subtotal nao alcanca o limite de frete gratis. */
export const TAXA_FRETE_REAIS = 5;

/** Subtotal a partir do qual o frete eh gratuito. */
export const LIMITE_FRETE_GRATIS = 20;

/** Retorna a taxa de entrega que deve ser cobrada pra um determinado subtotal. */
export function calcularFrete(subtotal: number): number {
  if (!Number.isFinite(subtotal)) return TAXA_FRETE_REAIS;
  return subtotal >= LIMITE_FRETE_GRATIS ? 0 : TAXA_FRETE_REAIS;
}

/** True quando o subtotal ja desbloqueou o frete gratis. */
export function temFreteGratis(subtotal: number): boolean {
  return subtotal >= LIMITE_FRETE_GRATIS;
}

/** Quantos reais ainda faltam pra alcancar o frete gratis (>=0). */
export function faltaParaFreteGratis(subtotal: number): number {
  return Math.max(0, Number((LIMITE_FRETE_GRATIS - subtotal).toFixed(2)));
}

/** Helper de exibicao usado em varios pontos da UI. */
export function rotuloFrete(subtotal: number): string {
  return temFreteGratis(subtotal) ? "Grátis" : fmtPreco(TAXA_FRETE_REAIS);
}

/** Total final cobrado do cliente (subtotal + taxa de entrega). */
export function calcularTotalComFrete(subtotal: number): number {
  return Number((subtotal + calcularFrete(subtotal)).toFixed(2));
}
