import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { boolean, pgSchema, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

// Skema hr sudah ada di database (dipakai v1). Di sini hanya dibaca, tidak ada migrasi.
const hr = pgSchema("hr");

export const users = hr.table("users", {
  userId: uuid("user_id").primaryKey(),
  username: varchar("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  employeeName: varchar("employee_name").notNull(),
  isActive: boolean("is_active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  role: varchar("role"),
  allowedSectionsOverride: text("allowed_sections_override").array(),
});

export const rolePermissions = hr.table("role_permissions", {
  role: varchar("role").notNull(),
  sections: text("sections").array().notNull(),
});

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export const db = drizzle(pool);
