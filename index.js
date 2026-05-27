import express from "express";
import fs from "fs";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const DB_FILE = "./bots.json";

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

app.get("/bots", (req, res) => {
  res.json(readBots());
});

app.post("/add", (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).send("Missing url");

  const bots = readBots();
  if (!bots.includes(url)) bots.push(url);
  writeBots(bots);

  res.send("Added");
});

app.post("/remove", (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).send("Missing url");

  const bots = readBots().filter(b => b !== url);
  writeBots(bots);

  res.send("Removed");
});

app.get("/ping", async (req, res) => {
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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Bot pinger running on port", port));
