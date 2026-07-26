"use client";

import { useEffect, useState } from "react";

// Mostra a cidade do visitante (detectada por IP via /api/geo).
// Enquanto nao detecta — ou quando nao ha dado (local, IP sem cidade) —
// exibe o fallback "sua cidade". Assim a frase nunca fica quebrada.

export function CidadeCliente({ fallback = "sua cidade" }: { fallback?: string }) {
  const [texto, setTexto] = useState(fallback);

  useEffect(() => {
    let ativo = true;
    fetch("/api/geo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { cidade?: string | null; uf?: string | null } | null) => {
        if (!ativo || !d?.cidade) return;
        setTexto(d.uf ? `${d.cidade}/${d.uf}` : d.cidade);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  return <>{texto}</>;
}
