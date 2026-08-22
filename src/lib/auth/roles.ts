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
  super_admin: "/admin",
  scanner: "/scan",
};

// Kedua role memakai workspace admin yang sama; yang membedakan hanya kewenangan
// di bawah. Dikumpulkan di satu tempat supaya aturan izin tidak tersebar.
export const ADMIN_ROLES: UserRole[] = ["admin", "super_admin"];

export function isAdminLevel(user: CurrentUser) {
  return user.role === "admin" || user.role === "super_admin";
}

// Hanya pemilik sistem: menghapus seluruh data transaksi, tidak dapat dibalik.
export function canResetData(user: CurrentUser) {
  return user.role === "super_admin";
}

// Hanya pemilik sistem: membuat/menghapus akun dan mengubah role, termasuk
// berpotensi mengunci pemilik dari sistemnya sendiri.
export function canManageUsers(user: CurrentUser) {
  return user.role === "super_admin";
}

// Klien boleh menolong operator yang lupa PIN di hari-H, tapi hanya untuk akun
// booth/kasir. Akun admin & super_admin tetap hanya boleh disentuh pemilik.
export function canResetOperatorPin(user: CurrentUser, targetRole: UserRole) {
  if (user.role === "super_admin") return true;
  return user.role === "admin" && (targetRole === "booth" || targetRole === "cashier");
}

/**
 * Siapa yang boleh memindai kehadiran.
 *
 * Petugas scan jelas boleh. Admin ikut boleh karena di acara kecil panitia yang
 * sama merangkap semuanya, dan memaksa mereka membuat akun kedua hanya untuk
 * berdiri di pintu masuk berarti akun itu akan dibagi-bagi — persis yang ingin
 * dihindari role ini.
 */
export function canScanAttendance(user: CurrentUser) {
  return user.role === "scanner" || isAdminLevel(user);
}

export function canAccessRole(user: CurrentUser, role: UserRole) {
  if (role === "admin") return isAdminLevel(user);
  return user.role === role;
}

export function canUseBooth(user: CurrentUser, boothId: number) {
  return isAdminLevel(user) || (user.role === "booth" && user.booth_id === boothId);
}
