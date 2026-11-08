import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";
import { jsonb, pgSchema, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { db, users } from "./db.js";

// Schema access dibuat oleh migrasi 2026-11-08_create_access_schema.sql.
const access = pgSchema("access");

export const permission = access.table("permission", {
  key: text("key").primaryKey(),
  feature: text("feature").notNull(),
  action: text("action").notNull(),
  description: text("description").notNull(),
});

export const rolePermission = access.table("role_permission", {
  role: varchar("role").notNull(),
  permissionKey: text("permission_key").notNull(),
  scope: jsonb("scope"),
});

export const userPermission = access.table("user_permission", {
  userId: uuid("user_id").notNull(),
  permissionKey: text("permission_key").notNull(),
  effect: text("effect").notNull(),
  scope: jsonb("scope"),
  grantedBy: uuid("granted_by"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export type Permissions = { allow: string[]; deny: string[] };

// '*' cocok dengan semua izin, 'schedule:*' cocok dengan semua aksi penjadwalan.
function matches(pattern: string, key: string) {
  if (pattern === "*" || pattern === key) return true;
  return pattern.endsWith(":*") && key.startsWith(pattern.slice(0, -1));
}

// Aturan: izin peran + allow khusus user, dikurangi deny khusus user. deny selalu menang. Tidak tercatat = ditolak.
export function can(perms: Permissions, key: string) {
  if (perms.deny.some((p) => matches(p, key))) return false;
  return perms.allow.some((p) => matches(p, key));
}

// Dihitung per permintaan (bukan disimpan di sesi) supaya perubahan izin langsung berlaku.
export async function loadPermissions(userId: string): Promise<Permissions> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.userId, userId));
  const byRole = user?.role
    ? await db.select({ key: rolePermission.permissionKey }).from(rolePermission).where(eq(rolePermission.role, user.role))
    : [];
  const overrides = await db.select().from(userPermission).where(eq(userPermission.userId, userId));

  return {
    allow: [...byRole.map((r) => r.key), ...overrides.filter((o) => o.effect === "allow").map((o) => o.permissionKey)],
    deny: overrides.filter((o) => o.effect === "deny").map((o) => o.permissionKey),
  };
}

// Daftar izin sah yang dimiliki user, untuk dikirim ke web (menyembunyikan menu dan tombol).
export async function effectivePermissionKeys(userId: string): Promise<string[]> {
  const [perms, catalog] = await Promise.all([loadPermissions(userId), db.select({ key: permission.key }).from(permission)]);
  return catalog.map((c) => c.key).filter((k) => k !== "*" && can(perms, k));
}

// Pengecekan di server pada endpoint. Menyembunyikan tombol di web hanya kenyamanan.
export function requirePermission(key: string): RequestHandler {
  return async (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: "Belum login" });
    const perms = await loadPermissions(req.session.userId);
    if (!can(perms, key)) return res.status(403).json({ error: "Anda tidak punya izin untuk aksi ini" });
    next();
  };
}
