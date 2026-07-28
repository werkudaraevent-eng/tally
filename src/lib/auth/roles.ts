import type { UserRole } from "../domain";
export type { UserRole } from "../domain";

export type CurrentUser = {
  id: string;
  username: string;
  role: UserRole;
  booth_id: number | null;
};

export const roleRedirects: Record<UserRole, string> = {
  booth: "/booth",
  cashier: "/cashier",
  admin: "/admin",
};

export function canAccessRole(user: CurrentUser, role: UserRole) {
  return user.role === role;
}

export function canUseBooth(user: CurrentUser, boothId: number) {
  return user.role === "admin" || (user.role === "booth" && user.booth_id === boothId);
}
