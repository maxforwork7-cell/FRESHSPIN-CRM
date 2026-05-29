/**
 * FreshSpin CRM — Node.js Server
 * Run:  node freshspin-server.js
 * Then open:  http://localhost:3000
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT      = process.env.PORT || 3000;
const HTML_FILE = path.join(__dirname, "FreshSpin_CRM_v2.html");

const server = http.createServer((req, res) => {
  fs.readFile(HTML_FILE, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 — FreshSpin_CRM_v2.html not found next to server file.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║         🧺  FreshSpin CRM Server          ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  ✅  Running at port: ${PORT}               ║`);
  console.log("╠══════════════════════════════════════════╣");
  console.log("║  Press Ctrl+C to stop the server          ║");
  console.log("╚══════════════════════════════════════════╝");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌  Port ${PORT} is already in use.`);
    console.error(`   Try again or set a different PORT.\n`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
