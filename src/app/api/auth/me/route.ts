import { getCurrentUser } from "@/lib/auth/login";

export async function GET() {
  const user = await getCurrentUser();
  return Response.json({ user });
}
