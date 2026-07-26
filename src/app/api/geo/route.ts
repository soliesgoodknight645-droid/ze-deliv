import { NextResponse } from "next/server";
import { headers } from "next/headers";

// GET /api/geo
// Retorna a cidade/UF aproximada do visitante a partir dos headers de
// geolocalizacao por IP que a Vercel injeta na Edge/serverless:
//   - x-vercel-ip-city            (nome da cidade, URL-encoded)
//   - x-vercel-ip-country-region  (UF, ex.: "AL")
//
// Em ambiente local (sem esses headers) retorna cidade=null e o front usa o
// fallback ("sua cidade"). Endpoint leve (nao toca banco), por isso e barato
// deixar dinamico enquanto a pagina /gaseagua continua cacheada.

export const dynamic = "force-dynamic";

export async function GET() {
  const h = headers();
  const cidadeRaw = h.get("x-vercel-ip-city");
  const uf = h.get("x-vercel-ip-country-region");

  let cidade: string | null = null;
  if (cidadeRaw) {
    try {
      cidade = decodeURIComponent(cidadeRaw).trim() || null;
    } catch {
      cidade = cidadeRaw.trim() || null;
    }
  }

  return NextResponse.json(
    { cidade, uf: uf?.trim() || null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
