import express from "express";
import fs from "fs";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dns from "dns/promises";

const app = express();
app.use(express.json());

const DB_FILE = "./bots.json";

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const PASSWORD_HASH = process.env.PASSWORD_HASH;
const JWT_SECRET = process.env.JWT_SECRET || "change-me";

// ---------- helpers ----------

function readBots() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ bots: [] }, null, 2));
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  return data.bots || [];
}

function writeBots(bots) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ bots }, null, 2));
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ---------- auth ----------

app.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password" });
  }

  const normalized = email.toLowerCase();
  if (!ALLOWED_EMAILS.includes(normalized)) {
    return res.status(403).json({ error: "Not allowed" });
  }

  if (!PASSWORD_HASH) {
    return res.status(500).json({ error: "Password not configured" });
  }

  const ok = await bcrypt.compare(password, PASSWORD_HASH);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ email: normalized }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token });
});

// ---------- bot routes (protected) ----------

app.get("/bots", authMiddleware, (req, res) => {
  res.json(readBots());
});

app.post("/add", authMiddleware, (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).send("Missing url");

  const bots = readBots();
  if (!bots.includes(url)) bots.push(url);
  writeBots(bots);

  res.send("Added");
});

app.post("/remove", authMiddleware, (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).send("Missing url");

  const bots = readBots().filter(b => b !== url);
  writeBots(bots);

  res.send("Removed");
});

app.get("/ping", authMiddleware, async (req, res) => {
  const bots = readBots();
  const results = [];

  for (const url of bots) {
    try {
      await fetch(url);
      results.push({ url, status: "OK" });
    } catch {
      results.push({ url, status: "FAILED" });
    }
  }

  res.json(results);
});

// ---------- hosting tools (protected) ----------

app.get("/dns/lookup", authMiddleware, async (req, res) => {
  const { domain } = req.query;
  if (!domain) return res.status(400).json({ error: "Missing domain" });

  try {
    const [a, aaaa] = await Promise.all([
      dns.resolve4(domain).catch(() => []),
      dns.resolve6(domain).catch(() => [])
    ]);
    res.json({ domain, A: a, AAAA: aaaa });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/ip/resolve", authMiddleware, async (req, res) => {
  const { host } = req.query;
  if (!host) return res.status(400).json({ error: "Missing host" });

  try {
    const addrs = await dns.lookup(host, { all: true });
    res.json({ host, addresses: addrs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Bot pinger running on port", port));
