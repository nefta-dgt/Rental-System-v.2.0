import "dotenv/config";
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, rolePermissions, users } from "./db.js";
import { scheduleRouter } from "./schedule.js";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

const SUPERADMIN = "Superadmin";

// Sesi disimpan di memori server (sementara, lihat daftar terbuka poin 9).
const app = express();
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? "",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 8 },
  }),
);

async function loadSections(user: { role: string | null; allowedSectionsOverride: string[] | null }) {
  if (user.role === SUPERADMIN) return ["*"];
  if (user.allowedSectionsOverride) return user.allowedSectionsOverride;
  if (!user.role) return [];
  const [row] = await db.select().from(rolePermissions).where(eq(rolePermissions.role, user.role));
  return row?.sections ?? [];
}

const loginBody = z.object({ username: z.string().min(1), password: z.string().min(1) });

app.post("/api/login", async (req, res) => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Username dan password wajib diisi" });

  const [user] = await db.select().from(users).where(eq(users.username, parsed.data.username));
  const ok = user && user.isActive && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!ok) return res.status(401).json({ error: "Username atau password salah" });

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "Gagal membuat sesi" });
    req.session.userId = user.userId;
    res.json({ username: user.username, name: user.employeeName, role: user.role });
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.get("/api/me", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Belum login" });
  const [user] = await db.select().from(users).where(eq(users.userId, req.session.userId));
  if (!user || !user.isActive) return res.status(401).json({ error: "Belum login" });
  res.json({ username: user.username, name: user.employeeName, role: user.role, sections: await loadSections(user) });
});

// Semua jadwal bisa dilihat user yang sudah login. Hak ubah menyusul (daftar terbuka poin 8).
const requireLogin: express.RequestHandler = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: "Belum login" });
  next();
};
app.use("/api/schedule", requireLogin, scheduleRouter);

const port = Number(process.env.PORT ?? 3200);
app.listen(port, () => console.log(`Server v2 jalan di http://localhost:${port}`));
