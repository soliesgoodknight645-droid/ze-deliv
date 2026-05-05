import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// =====================================================================
// Datas com fuso horário do Brasil (America/Sao_Paulo)
// =====================================================================
// O servidor (Vercel) roda em UTC. Usar `toLocaleString` sem timeZone
// fixo faz aparecer 3h adiantado no SSR. Sempre forcamos `America/Sao_Paulo`.
const FUSO_BR = "America/Sao_Paulo" as const;

export function fmtDataHoraBR(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    timeZone: FUSO_BR,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDataBR(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", {
    timeZone: FUSO_BR,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function fmtDataLongaBR(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    timeZone: FUSO_BR,
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Retorna a data ISO (YYYY-MM-DD) representando o "dia BR" daquele timestamp.
 * Util para agrupar pedidos por dia no fuso de Sao Paulo (em vez do UTC do servidor).
 */
export function diaIsoBR(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  // pt-CA dá ISO yyyy-mm-dd direto
  return date.toLocaleDateString("en-CA", { timeZone: FUSO_BR });
}

export function calcDesconto(price?: number | null, promoPrice?: number | null): number {
  if (!price || !promoPrice || price <= promoPrice) return 0;
  return Math.round(((price - promoPrice) / price) * 100);
}

export function precoFinal(price?: number | null, promoPrice?: number | null): number {
  return promoPrice ?? price ?? 0;
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function apenasDigitos(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\D/g, "");
}

export function fmtTelefone(s: string | null | undefined): string {
  const d = apenasDigitos(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s ?? "";
}

export function fmtCpf(s: string | null | undefined): string {
  const d = apenasDigitos(s);
  if (d.length !== 11) return s ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function fmtCep(s: string | null | undefined): string {
  const d = apenasDigitos(s);
  if (d.length !== 8) return s ?? "";
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function telefoneE164BR(s: string | null | undefined): string {
  const d = apenasDigitos(s);
  if (!d) return "";
  // Remove DDI 55 se presente, depois adiciona de novo
  const semDDI = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  return `55${semDDI}`;
}

export function linkWhatsApp(telefone: string, mensagem?: string): string {
  const num = telefoneE164BR(telefone);
  const base = `https://wa.me/${num}`;
  if (!mensagem) return base;
  return `${base}?text=${encodeURIComponent(mensagem)}`;
}

export function validarCpf(s: string): boolean {
  const d = apenasDigitos(s);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(d[i], 10) * (10 - i);
  let dig1 = (soma * 10) % 11;
  if (dig1 === 10) dig1 = 0;
  if (dig1 !== parseInt(d[9], 10)) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(d[i], 10) * (11 - i);
  let dig2 = (soma * 10) % 11;
  if (dig2 === 10) dig2 = 0;
  return dig2 === parseInt(d[10], 10);
}

export function validarTelefoneBR(s: string): boolean {
  const d = apenasDigitos(s);
  return d.length === 10 || d.length === 11;
}

export function validarCep(s: string): boolean {
  return apenasDigitos(s).length === 8;
}
