import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const target = path.resolve(
        root,
        "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname),
      );
      const relative = path.relative(root, target);
      if (
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        relative.split(path.sep).some((p) => p.startsWith(".")) ||
        relative.startsWith("node_modules")
      ) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(target);
      res
        .writeHead(200, {
          "Content-Type":
            types[path.extname(target)] || "application/octet-stream",
          "Cache-Control": "no-cache",
        })
        .end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(5173, "0.0.0.0", () =>
    console.log("Game ready: http://localhost:5173"),
  );
