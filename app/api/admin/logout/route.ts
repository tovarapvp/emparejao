import { getRawDb } from "@/db";
import { clearAdminSessionCookie, deleteAdminSession } from "@/lib/admin-auth";

export async function POST(request: Request) {
  try {
    await deleteAdminSession(request, getRawDb());
  } catch {
    // Clear the browser cookie even if the server-side session has already expired.
  }
  return Response.json(
    { authenticated: false },
    { headers: { "Set-Cookie": clearAdminSessionCookie(request) } },
  );
}
