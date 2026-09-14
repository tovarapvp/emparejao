import { getVapidPublicKey } from "@/lib/push";

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return Response.json(
      { error: "Los avisos push aún no están configurados en este servidor." },
      { status: 503 },
    );
  }

  return Response.json(
    { publicKey },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
