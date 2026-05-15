"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { repararBucketImagens } from "./actions";

type Resultado = Awaited<ReturnType<typeof repararBucketImagens>>;

/**
 * Botao + painel de diagnostico pro caso de fotos nao aparecerem no site.
 * Faz tudo de uma vez:
 *   1. Garante bucket "catalogo" existe e ta public.
 *   2. Migra URLs antigas (que dao 400/403) pra signed URLs (sempre
 *      funcionam, validade de 10 anos).
 *   3. Mostra diagnostico completo (bucket OK? arquivos? URLs antigas?).
 *   4. Invalida cache do site.
 */
export function RepararBucketButton() {
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [aberto, setAberto] = useState(false);

  async function aoClicar() {
    setRodando(true);
    setResultado(null);
    try {
      const r = await repararBucketImagens();
      setResultado(r);
      setAberto(true);
      if (r.ok) {
        const total = r.migracao.produtosMigrados + r.migracao.categoriasMigradas;
        if (total > 0) {
          toast.success(
            `Reparado: ${total} URL${total > 1 ? "s" : ""} migrada${total > 1 ? "s" : ""}. Veja detalhes →`,
          );
        } else {
          toast.success("Bucket OK. Veja diagnóstico →");
        }
      } else {
        toast.error("Reparo encontrou problemas. Veja detalhes →", { duration: 8000 });
      }
    } catch (e) {
      const erro = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error(`Falhou: ${erro}`, { duration: 12000 });
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={aoClicar}
        disabled={rodando}
        title="Repara fotos quebradas (clique se as fotos não estão aparecendo no site)"
        className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-xs font-bold bg-white text-brand-dark border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
      >
        {rodando ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Wrench className="w-3.5 h-3.5" />
        )}
        Reparar fotos
        {resultado && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAberto((a) => !a);
            }}
            className="ml-1 p-0.5 hover:bg-gray-100 rounded"
            aria-label="Toggle detalhes"
          >
            {aberto ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        )}
      </button>

      {resultado && aberto && <PainelDiagnostico r={resultado} />}
    </div>
  );
}

function PainelDiagnostico({ r }: { r: Resultado }) {
  const d = r.diagnostico;
  return (
    <div className="absolute top-12 right-0 w-[min(90vw,420px)] bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-50 text-xs space-y-2.5">
      <p className="font-extrabold text-sm text-brand-dark">Diagnóstico</p>

      <Linha label="Bucket existe" ok={d.bucketExiste} />
      <Linha label="Bucket público" ok={d.bucketPublico} />
      <Linha
        label="Arquivos no bucket"
        ok={d.totalArquivos !== null && d.totalArquivos > 0}
        valor={d.totalArquivos === null ? "?" : String(d.totalArquivos)}
      />

      {d.amostraUrlPublicaOk !== null && (
        <Linha
          label="URL pública funciona"
          ok={d.amostraUrlPublicaOk}
          extra={d.amostraUrlPublicaOk ? "(testada com HEAD)" : "(retorna 4xx no browser)"}
        />
      )}

      {d.amostraSignedUrlOk !== null && (
        <Linha label="Signed URL funciona" ok={d.amostraSignedUrlOk} />
      )}

      <hr className="my-2 border-gray-100" />

      <p className="font-bold text-brand-dark text-[11px] uppercase tracking-wide">
        Migração
      </p>
      <p>
        Produtos migrados:{" "}
        <strong className="text-brand-dark">{r.migracao.produtosMigrados}</strong>
      </p>
      <p>
        Categorias migradas:{" "}
        <strong className="text-brand-dark">{r.migracao.categoriasMigradas}</strong>
      </p>
      {r.migracao.falhas > 0 && (
        <p className="text-red-700">Falhas: {r.migracao.falhas}</p>
      )}

      {(d.produtosComUrlAntiga > 0 || d.categoriasComUrlAntiga > 0) && (
        <p className="text-orange-700">
          Ainda restam {d.produtosComUrlAntiga + d.categoriasComUrlAntiga} URLs antigas no banco.
        </p>
      )}

      {(d.erros.length > 0 || r.migracao.erros.length > 0) && (
        <>
          <hr className="my-2 border-gray-100" />
          <p className="font-bold text-red-700 text-[11px] uppercase tracking-wide">
            Erros
          </p>
          <ul className="space-y-1 max-h-32 overflow-auto">
            {[...d.erros, ...r.migracao.erros].map((e, i) => (
              <li key={i} className="text-red-700 break-words">
                · {e}
              </li>
            ))}
          </ul>
        </>
      )}

      {d.amostraUrlPublica && (
        <>
          <hr className="my-2 border-gray-100" />
          <p className="text-[10px] text-gray-400 break-all">
            URL teste: {d.amostraUrlPublica}
          </p>
        </>
      )}
    </div>
  );
}

function Linha({
  label,
  ok,
  valor,
  extra,
}: {
  label: string;
  ok: boolean;
  valor?: string;
  extra?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
      )}
      <span className="flex-1">{label}</span>
      {valor !== undefined && (
        <span className="font-bold text-brand-dark">{valor}</span>
      )}
      {extra && <span className="text-gray-400 text-[10px]">{extra}</span>}
    </div>
  );
}
