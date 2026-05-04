# Deploy do Zé Chegou 24h na Vercel

Instruções passo a passo pra subir o site em produção.

## Pré-requisitos

- Conta no [GitHub](https://github.com/) (grátis)
- Conta no [Supabase](https://supabase.com/) — você já tem
- Conta na [Vercel](https://vercel.com/) (grátis, pode logar com o GitHub)

---

## ETAPA 1 — Aplicar as migrations no Supabase

Você precisa rodar **2 migrations SQL** no painel do Supabase, em ordem.

1. Abra https://supabase.com/dashboard → seu projeto → **SQL Editor**
2. Crie uma "New query"
3. Cole o conteúdo de `supabase/migrations/0001_initial.sql` (pedidos, admins, etc.)
4. Clica em **Run**
5. Crie outra query
6. Cole o conteúdo de `supabase/migrations/0002_catalogo.sql` (categorias, produtos, storage)
7. Clica em **Run**

Esperado: `Success. No rows returned` em ambas.

> Se já rodou a 0001 anteriormente, pode pular ela.

---

## ETAPA 2 — Cadastrar você como admin

No SQL Editor:

```sql
insert into public.app_admins (email)
values ('SEU_EMAIL_AQUI')
on conflict (email) do nothing;
```

Depois, defina a senha (instantâneo, não usa email):

```sql
create extension if not exists pgcrypto;

update auth.users
set encrypted_password = crypt('SUA_SENHA_AQUI', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where email = 'SEU_EMAIL_AQUI';
```

> Se o usuário ainda não existir, primeiro vai em Auth → Users → "Add user" → "Create new user" → coloca email + senha.

---

## ETAPA 3 — Popular o catálogo (1015 produtos)

No terminal local, dentro de `app-novo/`:

```bash
npm run seed
```

Isso lê os JSONs e insere todas as 14 categorias e 1015 produtos no Supabase.

Esperado:

```
Conectado em https://....supabase.co
Lidos: 14 categorias, 1015 produtos
OK: 14 categorias
Inserindo 1015 produtos em batches...
  1015/1015
OK: catalogo migrado pro Supabase.
```

---

## ETAPA 4 — Testar local

```bash
npm run dev
```

Abra http://localhost:3000 — deve carregar normal puxando do Supabase.
Vá em http://localhost:3000/admin → loga com email + senha.
Teste editar um produto, mudar preço, trocar imagem.

---

## ETAPA 5 — Subir o código pro GitHub

1. Crie um repo novo no GitHub (privado é OK): https://github.com/new
2. No terminal local:

```bash
cd "c:\Users\carrefour\Desktop\Sites Black\ze\app-novo"
git add .
git commit -m "Site pronto pra producao"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

> Se pedir senha, use um **Personal Access Token** do GitHub
> (Settings → Developer settings → Tokens → Generate new token, marque "repo").

---

## ETAPA 6 — Deploy na Vercel

1. Acesse https://vercel.com/new
2. Faça login com o GitHub (autorize acesso ao repo)
3. Selecione o repo que você criou
4. **IMPORTANT:** Em "Root Directory" deixe vazio (ou aponte pra `app-novo` se o repo for o pai)
5. Em "Environment Variables" adicione **TODAS** essas:

| Nome | Valor |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://SEU_PROJETO.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a chave `anon` do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | a chave `service_role` (⚠️ secreta) |
| `NEXT_PUBLIC_SITE_URL` | `https://SEU_PROJETO.vercel.app` (atualize depois) |

6. Clica em **Deploy**

Em ~3 minutos vai estar no ar.

---

## ETAPA 7 — Atualizar redirect URL do Supabase

No Supabase: **Authentication → URL Configuration**

- **Site URL**: `https://SEU_PROJETO.vercel.app`
- **Redirect URLs**: adicione `https://SEU_PROJETO.vercel.app/admin/auth/callback`

Depois volte na Vercel: **Settings → Environment Variables** → atualize `NEXT_PUBLIC_SITE_URL` pro domínio real e faça **Redeploy**.

---

## ETAPA 8 — Domínio próprio (opcional)

1. Compre um domínio (Registro.br, GoDaddy, etc.)
2. Vercel: **Settings → Domains → Add** → coloca o domínio
3. Configura os DNS conforme a Vercel mandar
4. Atualiza `NEXT_PUBLIC_SITE_URL` no env e refaz deploy
5. Atualiza Site URL e Redirect URLs no Supabase

---

## Duas operações (A/B) — mesmo Supabase, Git e Vercel separados

Você pode manter **dois sites** apontando para o **mesmo projeto Supabase** (mesmo catálogo e pedidos), com **repos Git diferentes**, **projetos Vercel diferentes** e **domínios diferentes** — útil para teste A/B.

### Operação B (este clone / `ze-deliv`)

| O quê | Valor |
|--------|--------|
| Repositório Git | `https://github.com/soliesgoodknight645-droid/ze-deliv` (remote `ze-deliv`) |
| Time na Vercel | **xdsad's projects** (slug: `xdsads-projects-324eb859`) |
| Projeto Vercel | **`ze-deliv`** (URLs tipo `ze-deliv-….vercel.app`) |
| Domínio customizado | [https://ze-express24h.club/](https://ze-express24h.club/) |
| Supabase | O mesmo `.env` / mesmas env vars na Vercel do outro ambiente |

**`NEXT_PUBLIC_SITE_URL` na Vercel deste projeto** deve ser `https://ze-express24h.club` (ou a URL `.vercel.app` de staging), para webhooks e links do checkout baterem com o domínio certo.

### Por que o `vercel deploy` local às vezes falha

Se o `git remote origin` aponta para **outro** GitHub (ex.: `alvezemigh-create/ze-exprex`), o CLI da Vercel pode tentar o **projeto já ligado a esse repo** em **outra conta** → erro `Could not retrieve Project Settings` / 403.

**Correção:** na pasta `app-novo`, associe o diretório ao projeto certo (após criar token — ver abaixo):

```bash
cd app-novo
# Windows PowerShell: defina o token novo (não commite)
$env:VERCEL_TOKEN = "seu_token_novo"
npm run vercel:link:operacao-b
```

Ou em uma linha: `npx vercel link --yes --scope xdsads-projects-324eb859 --project ze-deliv --token SEU_TOKEN`

Se aparecer **“Which remote do you want to connect?”**, escolha **`ze-deliv`** (`soliesgoodknight645-droid/ze-deliv`), **não** o `origin` apontando pro outro GitHub.

Isso recria `.vercel/project.json` (pastas `.vercel` **não** vão pro Git — estão no `.gitignore`).

### Token da Vercel que vazou — o que fazer **agora**

Eu **não consigo revogar** pelo painel da sua conta; faça aí em 1 minuto:

1. Abra [vercel.com/account/tokens](https://vercel.com/account/tokens) (login na conta **xdsad's projects** / a que usa o projeto `ze-deliv`).
2. **Delete** o token que foi colado em chat / exposto.
3. **Create Token** → copie o novo **uma vez**.
4. Coloque no `app-novo/.env.local`: `VERCEL_TOKEN=...` (arquivo já está ignorado pelo Git).
5. **Não** cole o novo token em chat nem em issue pública.

Deploy local:

```bash
npx vercel deploy --prod --yes
```

Deploy principal continua sendo **push no `main` do `ze-deliv`** se o projeto na Vercel estiver com Git integrado a esse repo.

---

## Segurança final (CHECKLIST antes de divulgar o site)

- [ ] **Token da Vercel** que vazou → apagar em [Account → Tokens](https://vercel.com/account/tokens) e criar outro; guardar só em `.env.local` como `VERCEL_TOKEN`
- [ ] **Regenerar `SUPABASE_SERVICE_ROLE_KEY`** no Supabase (a antiga foi exposta no chat)
   - Settings → API → "Reset service_role key"
   - Atualiza nas env vars da Vercel e do `.env.local`
- [ ] Confirmar que o `.env.local` está no `.gitignore` (já está)
- [ ] Trocar a senha do admin pra uma forte
- [ ] Configurar SMTP custom (Resend, Postmark) pra magic link funcionar em produção sem rate limit
- [ ] Quando integrar gateway, configurar `ONETIMEPAY_PRIVATE_KEY` (ou similar) só nas env vars da Vercel

---

## Troubleshooting

**"Could not find the table 'public.categorias'"** → faltou rodar a migration 0002

**"sem permissão"** no admin → seu email não está em `app_admins`

**Imagens novas (uploadadas) não aparecem** → confere se o bucket `catalogo` está marcado como `public` no Supabase Storage

**Build da Vercel falha** → confere se TODAS as env vars foram adicionadas (especialmente `SUPABASE_SERVICE_ROLE_KEY`)
