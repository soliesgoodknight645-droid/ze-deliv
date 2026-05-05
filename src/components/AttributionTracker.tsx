"use client";

import { useEffect } from "react";
import { capturarAtribuicao } from "@/lib/atribuicao";

/**
 * Roda uma vez no client logo que a página carrega — não bloqueia render.
 * Captura UTMs/GCLID da URL na primeira visita e persiste em cookie + localStorage
 * (validade 90 dias, first-click attribution).
 */
export function AttributionTracker() {
  useEffect(() => {
    try {
      capturarAtribuicao();
    } catch {}
  }, []);
  return null;
}
