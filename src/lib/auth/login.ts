import bcrypt from "bcryptjs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { CurrentUser } from "./roles";

const SESSION_COOKIE = "tally_session";
// Default menutupi durasi acara penuh (BR non-functional: jangan auto-logout
// selama event). "Ingat saya" memperpanjang hingga 30 hari untuk device panitia
// yang dipakai berulang kali.
const SESSION_SECONDS = 12 * 60 * 60;
const REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60;

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is missing.");
  return secret;
}

function sign(id: string) {
  return createHmac("sha256", sessionSecret()).update(id).digest("hex");
}

function encodeSession(id: string) {
  return `${id}.${sign(id)}`;
}

function validSession(value: string) {
  const [id, signature] = value.split(".");
  if (!id || !signature || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const expected = sign(id);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return id;
}

export async function loginWithPin(username: string, pin: string, rememberMe = false): Promise<CurrentUser | null> {
  const client = getSupabaseServiceClient();
  const { data: user } = await client.from("users").select("id,username,pin_hash,role,booth_id,is_active").eq("username", username.trim()).eq("is_active", true).single() as { data: { id: string; username: string; pin_hash: string; role: "booth" | "cashier" | "admin"; booth_id: number | null; is_active: boolean } | null };
  if (!user || !(await bcrypt.compare(pin, user.pin_hash))) return null;
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession(user.id), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: rememberMe ? REMEMBER_ME_SECONDS : SESSION_SECONDS, path: "/" });
  return { id: user.id, username: user.username, role: user.role, booth_id: user.booth_id };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const id = raw ? validSession(raw) : null;
  if (!id) return null;
  const { data: user } = await getSupabaseServiceClient().from("users").select("id,username,role,booth_id,is_active").eq("id", id).eq("is_active", true).single() as { data: { id: string; username: string; role: "booth" | "cashier" | "admin"; booth_id: number | null; is_active: boolean } | null };
  return user ? { id: user.id, username: user.username, role: user.role, booth_id: user.booth_id } : null;
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
}
