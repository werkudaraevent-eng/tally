import { z } from "zod";
import { apiError } from "@/lib/api";
import { loginWithPin } from "@/lib/auth/login";

const schema = z.object({ username: z.string().trim().min(1).max(100), pin: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422);
  const user = await loginWithPin(parsed.data.username, parsed.data.pin);
  if (!user) return apiError("UNAUTHENTICATED", 401);
  return Response.json({ user });
}
