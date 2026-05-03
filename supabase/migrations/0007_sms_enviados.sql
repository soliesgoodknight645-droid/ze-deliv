-- =====================================================================
-- Zé Chegou 24h — Migration 0007
-- Controle de SMS de "carrinho/CPF abandonado" enviados via Axtron.
-- Regra de negocio: cada CPF so pode receber 1 SMS deste site por mes.
-- =====================================================================

create table if not exists public.sms_enviados (
  id uuid primary key default uuid_generate_v4(),
  cpf text not null,
  nome text,
  telefone text,
  mensagem text,
  status text not null default 'enviado',  -- 'enviado' | 'falha' | 'ignorado'
  resposta_api jsonb,
  criado_em timestamptz not null default now()
);

-- Lookup rapido pra checar "ja recebeu nos ultimos 30 dias?"
create index if not exists idx_sms_enviados_cpf_criado
  on public.sms_enviados (cpf, criado_em desc);

-- Apenas o backend (service_role) escreve/le essa tabela. Sem RLS
-- exposta pra anon — o lock da chave impede acesso pelo client.
alter table public.sms_enviados enable row level security;

drop policy if exists "sms_enviados_service_only" on public.sms_enviados;
create policy "sms_enviados_service_only"
  on public.sms_enviados
  as permissive
  for all
  to authenticated, anon
  using (false)
  with check (false);

-- =====================================================================
-- FIM
-- =====================================================================
