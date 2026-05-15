"use client";

import { useState } from "react";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { repararBucketImagens } from "./actions";

/**
 * Botao discreto no header de /admin/produtos pro caso de fotos novas
 * nao aparecerem no site (bucket privado, policy faltando). Forca a
 * configuracao do bucket via API admin do Supabase — depois de clicar,
 * subir foto de novo costuma resolver.
 */
export function RepararBucketButton() {
  const [rodando, setRodando] = useState(false);

  async function aoClicar() {
    setRodando(true);
    const r = await repararBucketImagens();
    setRodando(false);
    if (r.ok) {
      toast.success("Bucket de imagens OK — pode subir as fotos de novo");
    } else {
      toast.error(`Falha ao reparar: ${r.erro}`, { duration: 12000 });
    }
  }

  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={rodando}
      title="Repara o bucket de imagens (use se as fotos não estão aparecendo no site)"
      className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-xs font-bold bg-white text-brand-dark border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
    >
      {rodando ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Wrench className="w-3.5 h-3.5" />
      )}
      Reparar fotos
    </button>
  );
}
