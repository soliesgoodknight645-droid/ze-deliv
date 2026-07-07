// Checa as imagens da pagina /gaseagua em PRODUCAO.
// Uso: node scripts/checar-imagens-gaseagua-prod.mjs
const BASE = process.argv[2] || "https://ze-express24h.club";

const res = await fetch(`${BASE}/gaseagua`, {
  headers: { "user-agent": "Mozilla/5.0 (imagem-check)" },
});
console.log(`GET ${BASE}/gaseagua -> ${res.status}\n`);
const html = await res.text();

const srcs = new Set();
for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
  srcs.add(m[1].replace(/&amp;/g, "&"));
}
const altPorSrc = new Map();
for (const m of html.matchAll(/<img[^>]+alt="([^"]*)"[^>]*src="([^"]+)"/g)) {
  altPorSrc.set(m[2].replace(/&amp;/g, "&"), m[1]);
}
for (const m of html.matchAll(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/g)) {
  altPorSrc.set(m[1].replace(/&amp;/g, "&"), m[2]);
}

console.log(`Total de <img> unicos: ${srcs.size}\n`);

let ok = 0;
let quebradas = 0;
for (const src of srcs) {
  const url = src.startsWith("http") ? src : `${BASE}${src}`;
  try {
    const r = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (imagem-check)" },
    });
    const tipo = r.headers.get("content-type") ?? "?";
    const ehImagem = tipo.startsWith("image/");
    if (r.ok && ehImagem) {
      ok++;
      console.log(`OK   ${r.status} ${(altPorSrc.get(src) ?? "").slice(0, 45)}`);
    } else {
      quebradas++;
      let corpo = "";
      try {
        corpo = (await r.text()).slice(0, 200);
      } catch {}
      console.log(`FAIL ${r.status} ${tipo} ${(altPorSrc.get(src) ?? "").slice(0, 45)}`);
      console.log(`     src: ${src.slice(0, 150)}`);
      if (corpo) console.log(`     body: ${corpo.replace(/\s+/g, " ")}`);
    }
  } catch (e) {
    quebradas++;
    console.log(`ERR  ${e.message}`);
    console.log(`     src: ${src.slice(0, 150)}`);
  }
}

console.log(`\nResumo: ${ok} OK, ${quebradas} quebradas`);
