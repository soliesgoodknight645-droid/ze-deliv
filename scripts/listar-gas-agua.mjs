// Lista produtos da categoria agua-e-gas com slug + nome + imagem_url.
// Uso: node scripts/listar-gas-agua.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raiz = join(__dirname, "..");

function carregarEnv() {
  const txt = readFileSync(join(raiz, ".env.local"), "utf8");
  for (const linha of txt.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha.trim());
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

carregarEnv();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: cats } = await sb
  .from("categorias")
  .select("id, slug, nome")
  .in("slug", ["agua-e-gas", "aguas-e-gelo"]);
console.log("Categorias:", cats);

const ids = (cats ?? []).map((c) => c.id);
const { data: prods, error } = await sb
  .from("produtos")
  .select("id, slug, nome, categoria_id, imagem_url")
  .in("categoria_id", ids)
  .order("nome");

if (error) {
  console.error("ERRO:", error.message);
  process.exit(1);
}

console.log(`\n${prods.length} produtos:\n`);
for (const p of prods) {
  const cat = cats.find((c) => c.id === p.categoria_id)?.slug ?? "?";
  console.log(
    `[${cat}] ${p.slug}  |  ${p.nome}  |  img=${p.imagem_url ?? "(null)"}`,
  );
}
