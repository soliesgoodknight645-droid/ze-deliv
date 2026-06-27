"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const CHAVE = "ze:idade-confirmada:v1";

// Rotas que NAO mostram o age-gate: sao paginas institucionais sem qualquer
// referencia a bebida alcoolica/tabaco (ex.: vertical de gas e agua).
const ROTAS_SEM_AGE_GATE = ["/gaseagua"];

function rotaPulaAgeGate(pathname: string | null): boolean {
  if (!pathname) return false;
  return ROTAS_SEM_AGE_GATE.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  );
}

export function AgeGate() {
  const pathname = usePathname();
  const [confirmado, setConfirmado] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setConfirmado(localStorage.getItem(CHAVE) === "1");
    } catch {
      setConfirmado(true);
    }
  }, []);

  if (rotaPulaAgeGate(pathname)) return null;
  if (confirmado === null || confirmado) return null;

  const aceitar = () => {
    try {
      localStorage.setItem(CHAVE, "1");
    } catch {}
    setConfirmado(true);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center animate-slide-up">
        <div className="text-4xl mb-2">🔞</div>
        <h2 className="font-extrabold text-xl text-brand-dark mb-1">Você é maior de 18 anos?</h2>
        <p className="text-sm text-gray-500 mb-5 leading-relaxed">
          A venda de bebidas alcoólicas é proibida para menores de 18 anos.
        </p>
        <div className="flex gap-2">
          <a
            href="https://www.google.com"
            className="flex-1 h-11 px-4 rounded-full font-semibold text-sm flex items-center justify-center bg-gray-100 text-gray-700 active:scale-95 transition-transform"
          >
            Não
          </a>
          <button
            type="button"
            onClick={aceitar}
            className="flex-1 h-11 px-4 rounded-full font-bold text-sm flex items-center justify-center bg-brand-yellow text-brand-dark active:scale-95 transition-transform"
          >
            Sim, sou maior
          </button>
        </div>
      </div>
    </div>
  );
}
