"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  MapPinned,
  Phone,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { useCart } from "@/contexts/CartContext";
import { mensagemErroPedidoMinimo, subtotalAbaixoDoMinimo } from "@/lib/pedido-minimo";
import { fmtPreco, validarCep, validarCpf, validarTelefoneBR } from "@/lib/utils";
import { criarPedido } from "./actions";
import { EtapaEntregador } from "./etapa-entregador";
import {
  EtapaPagamento,
  type DadosCartao,
  type FormaPagamento,
  type MetodosAtivos,
} from "./etapa-pagamento";

type Etapa = "address" | "review" | "delivery" | "payment";

type DadosForm = {
  name: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  reference: string;
  cpf: string;
  observacoes: string;
};

const CHAVE_DADOS = "ze:checkout-dados:v3";

const ETAPAS: { key: Etapa; label: string; Icon: typeof MapPin }[] = [
  { key: "address", label: "Endereço", Icon: MapPin },
  { key: "review", label: "Revisão", Icon: CheckCircle2 },
  { key: "delivery", label: "Entregador", Icon: Bike },
  { key: "payment", label: "Pagamento", Icon: CreditCard },
];

const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const formatCep = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length > 5) return d.slice(0, 5) + "-" + d.slice(5);
  return d;
};

const CARTAO_VAZIO: DadosCartao = {
  numero: "",
  nome: "",
  validade: "",
  cvv: "",
  parcelas: 1,
};

export function CheckoutClient({ metodosAtivos }: { metodosAtivos: MetodosAtivos }) {
  const router = useRouter();
  const { itens, totalItens, totalValor, limpar, pronto } = useCart();
  const [etapa, setEtapa] = useState<Etapa>("address");
  // Forma inicial: o primeiro metodo ativo (pix > card > cash)
  const formaInicial: FormaPagamento = metodosAtivos.pix
    ? "pix"
    : metodosAtivos.card
      ? "card"
      : "cash";
  const [pagamento, setPagamento] = useState<FormaPagamento>(formaInicial);
  const [montado, setMontado] = useState(false);
  const [dados, setDados] = useState<DadosForm>({
    name: "",
    phone: "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    reference: "",
    cpf: "",
    observacoes: "",
  });
  const [cartao, setCartao] = useState<DadosCartao>(CARTAO_VAZIO);
  const [erros, setErros] = useState<Partial<Record<keyof DadosForm, string>>>({});
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [enderecoManual, setEnderecoManual] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pedidoCriado, setPedidoCriado] = useState(false);

  useEffect(() => {
    setMontado(true);
    try {
      const raw = localStorage.getItem(CHAVE_DADOS);
      if (raw) setDados((d) => ({ ...d, ...JSON.parse(raw) }));
    } catch {}
  }, []);

  useEffect(() => {
    if (!montado) return;
    try {
      localStorage.setItem(CHAVE_DADOS, JSON.stringify(dados));
    } catch {}
  }, [dados, montado]);

  useEffect(() => {
    if (!montado || !pronto || enviando || pedidoCriado) return;
    if (itens.length === 0) {
      router.replace("/carrinho");
      return;
    }
    if (subtotalAbaixoDoMinimo(totalValor)) {
      toast.error(mensagemErroPedidoMinimo());
      router.replace("/carrinho");
    }
  }, [montado, pronto, itens.length, totalValor, enviando, pedidoCriado, router]);

  const setCampo = <K extends keyof DadosForm>(k: K, v: DadosForm[K]) => {
    setDados((d) => ({ ...d, [k]: v }));
    setErros((e) => ({ ...e, [k]: undefined }));
  };

  const buscarCep = async () => {
    const cep = dados.cep.replace(/\D/g, "");
    if (cep.length !== 8) {
      toast.error("Digite um CEP válido");
      return;
    }
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await r.json();
      if (data.erro) {
        toast.error("CEP não encontrado");
        setEnderecoManual(true);
        return;
      }
      setDados((d) => ({
        ...d,
        street: data.logradouro || d.street,
        neighborhood: data.bairro || d.neighborhood,
        city: data.localidade || d.city,
        state: data.uf || d.state,
      }));
      setEnderecoManual(true);
      toast.success("Endereço encontrado! Confirme os dados.");
    } catch {
      toast.error("Erro ao buscar CEP. Preencha manualmente.");
      setEnderecoManual(true);
    } finally {
      setBuscandoCep(false);
    }
  };

  const usarLocalizacaoAtual = () => {
    if (!navigator.geolocation) {
      toast.error("Seu navegador não suporta geolocalização");
      setEnderecoManual(true);
      return;
    }
    toast.info("Buscando sua localização...");
    navigator.geolocation.getCurrentPosition(
      () => {
        toast.success("Localização identificada. Por favor, confirme os dados manualmente.");
        setEnderecoManual(true);
      },
      () => {
        toast.error("Não conseguimos acessar sua localização. Use CEP ou preencha manualmente.");
        setEnderecoManual(true);
      },
    );
  };

  const validarAddress = (): boolean => {
    const e: Partial<Record<keyof DadosForm, string>> = {};
    const nomeParts = dados.name.trim().split(/\s+/);
    if (nomeParts.length < 2 || nomeParts[0].length < 2) {
      e.name = "Informe nome e sobrenome";
    }
    if (!validarTelefoneBR(dados.phone)) {
      e.phone = "Telefone inválido — use DDD + número (10 ou 11 dígitos)";
    }
    if (!validarCep(dados.cep)) {
      e.cep = "CEP precisa ter 8 dígitos";
    }
    if (!dados.street.trim()) e.street = "Rua obrigatória";
    if (!dados.number.trim()) e.number = "Número obrigatório";
    if (!dados.neighborhood.trim()) e.neighborhood = "Bairro obrigatório";
    if (!dados.city.trim()) e.city = "Cidade obrigatória";
    if (!/^[A-Z]{2}$/.test(dados.state.trim())) e.state = "UF obrigatória (ex: SP)";
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const validarPagamento = (): boolean => {
    const e: Partial<Record<keyof DadosForm, string>> = {};
    if (!validarCpf(dados.cpf)) {
      e.cpf = "CPF inválido — confira os dígitos";
    }
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const irPara = (e: Etapa) => {
    if ((e === "review" || e === "delivery" || e === "payment") && !validarAddress()) {
      toast.error("Preencha os campos obrigatórios");
      if (!enderecoManual) setEnderecoManual(true);
      return;
    }
    setEtapa(e);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finalizar = async () => {
    if (subtotalAbaixoDoMinimo(totalValor)) {
      toast.error(mensagemErroPedidoMinimo());
      router.push("/carrinho");
      return;
    }
    if (!validarAddress()) {
      toast.error("Preencha os campos do endereço");
      setEtapa("address");
      return;
    }
    if (!validarPagamento()) {
      toast.error("Verifique os dados do pagamento");
      return;
    }
    if (pagamento === "cash") {
      toast.error("Pagamento em dinheiro não disponível no momento.");
      return;
    }

    // SMS de "carrinho/CPF abandonado" — dispara assim que a pessoa clica em
    // continuar/finalizar com CPF valido. Limite de 1 SMS por CPF a cada 30
    // dias e o controle de rate fica no backend (tabela sms_enviados). Fire
    // and forget: nao bloqueia o checkout se a Axtron estiver fora do ar.
    void fetch("/api/sms/disparar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cpf: dados.cpf,
        nome: dados.name,
        telefone: dados.phone,
      }),
      keepalive: true,
    }).catch(() => {});

    setEnviando(true);
    try {
      const r = await criarPedido({
        cliente: {
          nome: dados.name,
          telefone: dados.phone,
          cpf: dados.cpf,
        },
        endereco: {
          cep: dados.cep,
          street: dados.street,
          number: dados.number,
          complement: dados.complement,
          neighborhood: dados.neighborhood,
          city: dados.city,
          state: dados.state,
          reference: dados.reference,
        },
        observacoes: dados.observacoes,
        formaPagamento: pagamento,
        itens: itens.map((i) => ({
          produtoId: i.produtoId,
          slug: i.slug,
          nome: i.nome,
          quantidade: i.quantidade,
          precoUnitario: i.precoUnitario,
          imagem: i.imagem,
        })),
        total: totalValor,
        cartao:
          pagamento === "card"
            ? {
                numero: cartao.numero,
                nome: cartao.nome,
                validade: cartao.validade,
                cvv: cartao.cvv,
                parcelas: cartao.parcelas,
              }
            : undefined,
      });

      if (!r.ok) {
        toast.error(r.erro || "Erro ao registrar pedido");
        return;
      }

      try {
        const raw = localStorage.getItem("ze:pedidos:v1");
        const lista = raw ? JSON.parse(raw) : [];
        lista.push({ numero: r.numero, criado: new Date().toISOString(), total: totalValor });
        localStorage.setItem("ze:pedidos:v1", JSON.stringify(lista));
      } catch {}
      setPedidoCriado(true);
      router.push(`/pedido/${r.numero}`);
      limpar();
      return;
    } catch (e) {
      console.error(e);
      toast.error("Erro ao registrar pedido. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const voltarStep = () => {
    if (etapa === "address") {
      router.push("/carrinho");
      return;
    }
    if (etapa === "review") setEtapa("address");
    else if (etapa === "delivery") setEtapa("review");
    else if (etapa === "payment") setEtapa("delivery");
  };

  if (!pronto || !montado) {
    return (
      <div className="min-h-screen bg-brand-gray">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  const idxAtual = ETAPAS.findIndex((e) => e.key === etapa);

  return (
    <div className="min-h-screen bg-brand-gray flex flex-col">
      <Header />
      <div className="max-w-screen-md mx-auto w-full px-4 py-5 flex-1 pb-28">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-5">
          {ETAPAS.map((e, t) => {
            const Icon = e.Icon;
            const ativo = t <= idxAtual;
            return (
              <div key={e.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                      ativo ? "bg-brand-yellow text-brand-dark" : "bg-gray-200 text-gray-400"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span
                    className={`text-[10px] font-bold ${
                      ativo ? "text-brand-dark" : "text-gray-400"
                    }`}
                  >
                    {e.label}
                  </span>
                </div>
                {t < ETAPAS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1.5 rounded transition-colors ${
                      t < idxAtual ? "bg-brand-yellow" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* === ENDEREÇO === */}
        {etapa === "address" && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden bg-brand-yellow flex items-center justify-between px-4 py-2.5">
              <div className="font-display text-brand-dark">
                <span className="italic font-extrabold mr-1.5">Zé</span>
                <span className="font-extrabold">FRETE</span>{" "}
                <span className="text-white drop-shadow font-extrabold">GRÁTIS</span>
                <p className="text-[10px] font-bold leading-none mt-0.5">NA PRIMEIRA COMPRA</p>
              </div>
              <span className="text-2xl">🍻</span>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
              <div>
                <label className="text-sm font-semibold text-brand-dark mb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-brand-yellow" /> Nome Completo *
                </label>
                <input
                  type="text"
                  value={dados.name}
                  onChange={(e) => setCampo("name", e.target.value)}
                  placeholder="Digite seu nome completo"
                  style={{ fontSize: 16 }}
                  className={`w-full h-12 px-4 rounded-xl border bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-transparent placeholder:text-gray-400 ${
                    erros.name ? "border-red-400 bg-red-50/30" : "border-gray-200"
                  }`}
                />
                {erros.name && <p className="text-xs text-red-500 mt-1">{erros.name}</p>}
              </div>
              <div>
                <label className="text-sm font-semibold text-brand-dark mb-2 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-brand-green" /> Telefone/WhatsApp *
                </label>
                <input
                  type="tel"
                  value={dados.phone}
                  onChange={(e) => setCampo("phone", formatPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  style={{ fontSize: 16 }}
                  className={`w-full h-12 px-4 rounded-xl border bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-transparent placeholder:text-gray-400 ${
                    erros.phone ? "border-red-400 bg-red-50/30" : "border-gray-200"
                  }`}
                />
                {erros.phone && <p className="text-xs text-red-500 mt-1">{erros.phone}</p>}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-brand-dark">
                Escolha como deseja confirmar seu endereço
              </h3>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <MapPin className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={dados.cep}
                  onChange={(e) => setCampo("cep", formatCep(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      buscarCep();
                    }
                  }}
                  placeholder="Digite seu CEP"
                  maxLength={9}
                  style={{ fontSize: 16 }}
                  className="w-full h-12 pl-10 pr-24 rounded-xl border border-gray-200 bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-transparent placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={buscarCep}
                  disabled={buscandoCep}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-4 h-9 rounded-lg text-xs font-bold text-brand-dark active:scale-95 transition-transform disabled:opacity-50 bg-brand-yellow"
                >
                  {buscandoCep ? "..." : "Buscar"}
                </button>
              </div>

              <button
                type="button"
                onClick={usarLocalizacaoAtual}
                className="w-full h-12 rounded-xl border-2 border-brand-yellow bg-yellow-50/50 flex items-center justify-center gap-2 text-sm font-bold text-brand-dark active:scale-[0.98] transition-transform"
              >
                <MapPinned className="w-4 h-4" /> Usar Localização Atual
              </button>
              <p className="text-[11px] text-gray-400 text-center -mt-1">
                Ativar permissão (recomendado)
              </p>

              <button
                type="button"
                onClick={() => setEnderecoManual((v) => !v)}
                className="w-full flex items-center justify-center gap-1 text-sm text-gray-500 py-1.5 active:text-gray-700"
              >
                <MapPin className="w-3.5 h-3.5" /> Confirmar endereço manualmente
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${enderecoManual ? "rotate-180" : ""}`}
                />
              </button>

              {enderecoManual && (
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Rua *</label>
                    <input
                      type="text"
                      value={dados.street}
                      onChange={(e) => setCampo("street", e.target.value)}
                      placeholder="Rua, Avenida..."
                      style={{ fontSize: 16 }}
                      className={`w-full h-11 px-4 rounded-xl border bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-brand-yellow placeholder:text-gray-400 ${
                        erros.street ? "border-red-400" : "border-gray-200"
                      }`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">
                        Número *
                      </label>
                      <input
                        type="text"
                        value={dados.number}
                        onChange={(e) => setCampo("number", e.target.value)}
                        placeholder="123"
                        style={{ fontSize: 16 }}
                        className={`w-full h-11 px-4 rounded-xl border bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-brand-yellow placeholder:text-gray-400 ${
                          erros.number ? "border-red-400" : "border-gray-200"
                        }`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">
                        Complemento
                      </label>
                      <input
                        type="text"
                        value={dados.complement}
                        onChange={(e) => setCampo("complement", e.target.value)}
                        placeholder="Apt, bloco..."
                        style={{ fontSize: 16 }}
                        className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-brand-yellow placeholder:text-gray-400"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">
                      Bairro *
                    </label>
                    <input
                      type="text"
                      value={dados.neighborhood}
                      onChange={(e) => setCampo("neighborhood", e.target.value)}
                      placeholder="Centro"
                      style={{ fontSize: 16 }}
                      className={`w-full h-11 px-4 rounded-xl border bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-brand-yellow placeholder:text-gray-400 ${
                        erros.neighborhood ? "border-red-400" : "border-gray-200"
                      }`}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-gray-500 mb-1 block">
                        Cidade *
                      </label>
                      <input
                        type="text"
                        value={dados.city}
                        onChange={(e) => setCampo("city", e.target.value)}
                        placeholder="Sua cidade"
                        style={{ fontSize: 16 }}
                        className={`w-full h-11 px-4 rounded-xl border bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-brand-yellow placeholder:text-gray-400 ${
                          erros.city ? "border-red-400" : "border-gray-200"
                        }`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">UF *</label>
                      <input
                        type="text"
                        value={dados.state}
                        onChange={(e) =>
                          setCampo("state", e.target.value.toUpperCase().slice(0, 2))
                        }
                        placeholder="SP"
                        maxLength={2}
                        style={{ fontSize: 16 }}
                        className={`w-full h-11 px-4 rounded-xl border bg-gray-50 text-base uppercase focus:outline-none focus:ring-2 focus:ring-brand-yellow placeholder:text-gray-400 ${
                          erros.state ? "border-red-400" : "border-gray-200"
                        }`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">
                      Ponto de referência (opcional)
                    </label>
                    <input
                      type="text"
                      value={dados.reference}
                      onChange={(e) => setCampo("reference", e.target.value)}
                      placeholder="Ex: ao lado do mercado"
                      style={{ fontSize: 16 }}
                      className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-brand-yellow placeholder:text-gray-400"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* === REVISÃO === */}
        {etapa === "review" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-brand-dark">Dados da Entrega</h3>
                <button
                  type="button"
                  onClick={() => setEtapa("address")}
                  className="text-xs font-bold text-brand-yellow inline-flex items-center gap-1 active:scale-95"
                >
                  Editar
                </button>
              </div>
              <div className="space-y-2.5 text-sm">
                <div className="flex gap-2">
                  <User className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400">Nome</p>
                    <p className="text-brand-dark">{dados.name}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Phone className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400">Telefone</p>
                    <p className="text-brand-dark">{dados.phone}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400">Endereço</p>
                    <p className="text-brand-dark leading-relaxed">
                      {dados.street}, {dados.number}
                      {dados.complement ? ` - ${dados.complement}` : ""}, {dados.neighborhood}
                      <br />
                      {dados.city} - {dados.state}, CEP {dados.cep}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 items-center pt-1 text-brand-yellow">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <p className="text-sm font-semibold">Entrega em até 30 minutos</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="text-sm font-bold text-brand-dark mb-3">Itens do Pedido</h3>
              <ul className="space-y-3">
                {itens.map((item) => (
                  <li key={item.produtoId} className="flex gap-3 items-center">
                    <div className="w-12 h-12 rounded-lg bg-gray-50 relative flex-shrink-0 overflow-hidden">
                      {item.imagem && (
                        <Image
                          src={item.imagem}
                          alt={item.nome}
                          fill
                          sizes="48px"
                          className="object-contain p-1"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-brand-dark line-clamp-1">
                        {item.quantidade}x {item.nome}
                      </p>
                      <p className="text-xs text-gray-500">
                        {fmtPreco(item.precoUnitario)} cada
                      </p>
                    </div>
                    <span className="text-sm font-extrabold text-brand-dark">
                      {fmtPreco(item.quantidade * item.precoUnitario)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-gray-100 mt-4 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold text-brand-dark">{fmtPreco(totalValor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Taxa de entrega</span>
                  <span className="font-semibold text-brand-green">GRÁTIS</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-gray-100">
                  <span className="font-bold text-brand-dark">Total</span>
                  <span className="font-extrabold text-lg text-brand-red">
                    {fmtPreco(totalValor)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === ENTREGADOR === */}
        {etapa === "delivery" && (
          <EtapaEntregador
            endereco={{
              street: dados.street,
              number: dados.number,
              neighborhood: dados.neighborhood,
              city: dados.city,
              state: dados.state,
              cep: dados.cep,
            }}
          />
        )}

        {/* === PAGAMENTO === */}
        {etapa === "payment" && (
          <EtapaPagamento
            total={totalValor}
            cpf={dados.cpf}
            setCpf={(v) => setCampo("cpf", v)}
            erroCpf={erros.cpf}
            observacoes={dados.observacoes}
            setObservacoes={(v) => setCampo("observacoes", v)}
            metodos={metodosAtivos}
            forma={pagamento}
            setForma={setPagamento}
            cartao={cartao}
            setCartao={setCartao}
            enviando={enviando}
            onFinalizar={finalizar}
          />
        )}
      </div>

      {/* Sticky bottom bar — sem botao de finalizar (vai dentro do card de pagamento) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-30">
        <div className="max-w-screen-md mx-auto flex items-center gap-3">
          <div className="flex-shrink-0">
            <p className="text-[10px] text-gray-400 leading-none">Total do Pedido</p>
            <p className="font-extrabold text-base text-brand-red leading-tight">
              {fmtPreco(totalValor)}{" "}
              <span className="text-xs text-gray-400 font-normal">/ {totalItens} itens</span>
            </p>
          </div>
          <div className="flex-1 flex gap-2 justify-end">
            <button
              type="button"
              onClick={voltarStep}
              className="h-12 px-4 rounded-xl font-bold text-sm border border-gray-200 text-gray-600 active:scale-[0.98] transition-transform inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </button>
            {etapa === "address" && (
              <button
                type="button"
                onClick={() => irPara("review")}
                className="h-12 px-5 rounded-xl font-bold text-sm bg-brand-yellow text-brand-dark active:scale-[0.98] transition-transform inline-flex items-center gap-1"
              >
                Continuar <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {etapa === "review" && (
              <button
                type="button"
                onClick={() => irPara("delivery")}
                className="h-12 px-5 rounded-xl font-bold text-sm bg-brand-yellow text-brand-dark active:scale-[0.98] transition-transform inline-flex items-center gap-1"
              >
                Continuar <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {etapa === "delivery" && (
              <button
                type="button"
                onClick={() => irPara("payment")}
                className="h-12 px-5 rounded-xl font-bold text-sm bg-brand-yellow text-brand-dark active:scale-[0.98] transition-transform inline-flex items-center gap-1"
              >
                Ir para Pagamento <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {/* Etapa "payment" — finalizar fica DENTRO do card do método */}
          </div>
        </div>
      </div>
    </div>
  );
}
