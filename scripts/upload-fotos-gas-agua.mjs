// Sobe as fotos padronizadas (geradas por IA) pro bucket "catalogo" do
// Supabase em produtos/<slug>.png e seta produtos.imagem_url pro proxy
// /api/imagem-storage/produtos/<slug>.png.
//
// Uso: node scripts/upload-fotos-gas-agua.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raiz = join(__dirname, "..");

// Pasta onde a IA salvou as imagens.
const DIR_ASSETS =
  "C:\\Users\\carrefour\\.cursor\\projects\\c-Users-carrefour-Desktop-Sites-Black-ze\\assets";

const BUCKET = "catalogo";

// slug do produto -> arquivo de imagem
const MAPA = {
  "botijao-13kg-p13": "botijao-13kg-p13.png",
  "botijao-13kg-p13-liquigas": "botijao-13kg-p13-liquigas.png",
  "botijao-13kg-p13-copagaz": "botijao-13kg-p13-copagaz.png",
  "botijao-13kg-p13-consigaz": "botijao-13kg-p13-consigaz.png",
  "botijao-13kg-p13-servgas": "botijao-13kg-p13-servgas.png",
  "botijao-13kg-p13-fogas": "botijao-13kg-p13-fogas.png",
  "botijao-de-gas-5kg-p5": "botijao-de-gas-5kg-p5.png",
  "garrafao-20l-ibira": "garrafao-20l-ibira.png",
  "garrafao-20l-lindoya": "garrafao-20l-lindoya.png",
  "garrafao-20l-purissima": "garrafao-20l-purissima.png",
  "agua-galao-20l-309": "garrafao-agua-20l-generico.png",
  "galao-de-agua-mineral-20l-gelado-713": "garrafao-agua-20l-generico.png",
};

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

// Garante bucket publico (idempotente).
const { data: bkt } = await sb.storage.getBucket(BUCKET);
if (!bkt) {
  await sb.storage.createBucket(BUCKET, { public: true });
  console.log(`Bucket ${BUCKET} criado.`);
} else if (!bkt.public) {
  await sb.storage.updateBucket(BUCKET, { public: true });
  console.log(`Bucket ${BUCKET} marcado como publico.`);
}

let ok = 0;
let falhas = 0;

for (const [slug, arquivo] of Object.entries(MAPA)) {
  const caminho = join(DIR_ASSETS, arquivo);
  let bytes;
  try {
    bytes = readFileSync(caminho);
  } catch (e) {
    console.error(`SKIP ${slug}: nao li ${caminho} (${e.message})`);
    falhas++;
    continue;
  }

  const pathBucket = `produtos/${slug}.png`;
  const { error: errUp } = await sb.storage
    .from(BUCKET)
    .upload(pathBucket, bytes, { upsert: true, contentType: "image/png" });
  if (errUp) {
    console.error(`UPLOAD FALHOU ${slug}: ${errUp.message}`);
    falhas++;
    continue;
  }

  const imagemUrl = `/api/imagem-storage/${pathBucket
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")}`;

  const { data: upd, error: errDb } = await sb
    .from("produtos")
    .update({ imagem_url: imagemUrl })
    .eq("slug", slug)
    .select("id, slug");
  if (errDb) {
    console.error(`UPDATE FALHOU ${slug}: ${errDb.message}`);
    falhas++;
    continue;
  }
  if (!upd || upd.length === 0) {
    console.error(`SEM MATCH no banco pra slug=${slug}`);
    falhas++;
    continue;
  }

  console.log(`OK ${slug} -> ${imagemUrl}`);
  ok++;
}

console.log(`\nConcluido: ${ok} ok, ${falhas} falhas.`);
