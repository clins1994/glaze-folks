import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

createServer((request, response) => {
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const resolved = normalize(join(root, relativePath));

  if (!resolved.startsWith(root) || !existsSync(resolved) || statSync(resolved).isDirectory()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": types[extname(resolved)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(resolved).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Folks prototype: http://127.0.0.1:${port}/?variant=A`);
});
