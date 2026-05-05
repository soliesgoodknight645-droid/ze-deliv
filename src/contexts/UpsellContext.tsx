"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CUPOM_UPSELL } from "@/lib/cupom-upsell";

const CHAVE_STORAGE = "ze:upsell:v2";

export type DadosClienteUpsell = {
  nome: string;
  telefone: string;
  cpf: string;
  email?: string | null;
  endereco: {
    cep: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    reference?: string;
  };
};

type EstadoPersistido = {
  pedidoRef: string;
  ativadoEm: number; // ms epoch
  expiraEm: number;  // ms epoch (validade real, ex.: 24h)
  cliente: DadosClienteUpsell;
};

type UpsellCtx = {
  ativo: boolean;
  pedidoRef: string | null;
  expiraEm: number | null;
  cliente: DadosClienteUpsell | null;
  /** Tempo ate expirar de verdade (validade real). Usado pra guards. */
  tempoRestanteMs: number;
  tempoRestanteSeg: number;
  /** Cronometro de "vitrine" (pressao de marketing). NAO invalida o cupom. */
  tempoVitrineMs: number;
  tempoVitrineSeg: number;
  ativar: (input: { pedidoRef: string; cliente: DadosClienteUpsell }) => void;
  desativar: () => void;
  pronto: boolean;
  /** Só preenchido na rota /upsell — usado pelo CartSheet pra mesmo fluxo do botão amarelo. */
  registrarPagarPixUpsell: (fn: (() => Promise<void>) | null) => void;
  executarPagarPixUpsell: () => Promise<void>;
};

const Ctx = createContext<UpsellCtx | null>(null);

export function UpsellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pagarPixUpsellRef = useRef<(() => Promise<void>) | null>(null);
  const [estado, setEstado] = useState<EstadoPersistido | null>(null);
  const [agora, setAgora] = useState<number>(() => Date.now());
  const [pronto, setPronto] = useState(false);

  const registrarPagarPixUpsell = useCallback((fn: (() => Promise<void>) | null) => {
    pagarPixUpsellRef.current = fn;
  }, []);

  const executarPagarPixUpsell = useCallback(async () => {
    const fn = pagarPixUpsellRef.current;
    if (fn) {
      await fn();
      return;
    }
    toast.info("Abra a página do cupom pra gerar o PIX com o desconto.");
    router.push("/upsell");
  }, [router]);

  // hidrata do localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAVE_STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw) as EstadoPersistido;
        if (parsed?.expiraEm && parsed.expiraEm > Date.now()) {
          setEstado(parsed);
        } else {
          localStorage.removeItem(CHAVE_STORAGE);
        }
      }
    } catch {
      // ignora storage corrompido
    }
    setPronto(true);
  }, []);

  // tick do relogio
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // expira automaticamente
  useEffect(() => {
    if (estado && estado.expiraEm <= agora) {
      setEstado(null);
      try {
        localStorage.removeItem(CHAVE_STORAGE);
      } catch {}
    }
  }, [agora, estado]);

  const ativar = useCallback(
    ({ pedidoRef, cliente }: { pedidoRef: string; cliente: DadosClienteUpsell }) => {
      const agora = Date.now();
      const novo: EstadoPersistido = {
        pedidoRef,
        ativadoEm: agora,
        expiraEm: agora + CUPOM_UPSELL.DURACAO_MS,
        cliente,
      };
      setEstado(novo);
      try {
        localStorage.setItem(CHAVE_STORAGE, JSON.stringify(novo));
      } catch {}
    },
    [],
  );

  const desativar = useCallback(() => {
    setEstado(null);
    try {
      localStorage.removeItem(CHAVE_STORAGE);
    } catch {}
  }, []);

  const tempoRestanteMs = estado ? Math.max(0, estado.expiraEm - agora) : 0;
  const tempoRestanteSeg = Math.floor(tempoRestanteMs / 1000);
  const tempoVitrineMs = estado
    ? Math.max(0, estado.ativadoEm + CUPOM_UPSELL.DURACAO_VITRINE_MS - agora)
    : 0;
  const tempoVitrineSeg = Math.floor(tempoVitrineMs / 1000);

  const valor = useMemo<UpsellCtx>(
    () => ({
      ativo: Boolean(estado),
      pedidoRef: estado?.pedidoRef ?? null,
      expiraEm: estado?.expiraEm ?? null,
      cliente: estado?.cliente ?? null,
      tempoRestanteMs,
      tempoRestanteSeg,
      tempoVitrineMs,
      tempoVitrineSeg,
      ativar,
      desativar,
      pronto,
      registrarPagarPixUpsell,
      executarPagarPixUpsell,
    }),
    [
      estado,
      tempoRestanteMs,
      tempoRestanteSeg,
      tempoVitrineMs,
      tempoVitrineSeg,
      ativar,
      desativar,
      pronto,
      registrarPagarPixUpsell,
      executarPagarPixUpsell,
    ],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useUpsell() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUpsell precisa estar dentro de <UpsellProvider>");
  return c;
}

export function formatarMmSs(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
