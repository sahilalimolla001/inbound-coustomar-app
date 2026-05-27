const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8010);
const apiBase = (process.env.WAREHOUSE_API_URL || "https://evsphere-warehouse-backend-production.up.railway.app/api").replace(/\/+$/, "");
const contentTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/config.js") {
    res.writeHead(200, { "Content-Type": contentTypes[".js"], "Cache-Control": "no-store" });
    res.end(`window.INBOUND_CONFIG = ${JSON.stringify({ apiBase })};`);
    return;
  }
  const requested = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const file = path.resolve(root, requested);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentTypes[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Inbound customer app running on http://0.0.0.0:${port}`));
