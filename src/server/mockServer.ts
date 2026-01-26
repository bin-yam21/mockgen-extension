import http from "http";
import fs from "fs";
import path from "path";
import url from "url";

type MockDefinition = {
  method: string;
  status?: number;
  headers?: Record<string, string>;
  body?: any;
  responses?: any[];
  stateful?: boolean;
};

let autoId = 1;
const stateStore: Record<string, any[]> = {};

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function applyTemplate(template: any, body: any) {
  if (typeof template !== "object") return template;

  const result: any = {};
  for (const k in template) {
    const v = template[k];
    if (typeof v === "string") {
      result[k] = v
        .replace("{{auto}}", String(autoId++))
        .replace(/\{\{body\.(.+?)\}\}/g, (_, f) => body?.[f] ?? null);
    } else {
      result[k] = v;
    }
  }
  return result;
}

export function startMockServer(rootPath: string, startingPort = 3000) {
  let port = startingPort;
  const maxAttempts = 10;

  let mocks: Record<string, MockDefinition> = loadMocks();

  const server = http.createServer(async (req, res) => {
    const method = req.method?.toUpperCase() ?? "";
    const pathname = url.parse(req.url ?? "").pathname ?? "";

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "*");

    if (method === "OPTIONS") return res.end();

    const match = Object.entries(mocks).find(([route, mock]) => {
      if (mock.method !== method) return false;

      const routeParts: string[] = route.split("/").filter(Boolean);
      const urlParts: string[] = pathname.split("/").filter(Boolean);

      if (routeParts.length !== urlParts.length) return false;

      return routeParts.every((part, i) => part.startsWith(":") || part === urlParts[i]);
    });

    if (!match) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "Mock not found" }));
    }

    const [, mock] = match;
    const reqBody = await parseBody(req);

    // Random response
    let response: any = mock;
    if (Array.isArray(mock.responses)) {
      response = mock.responses[Math.floor(Math.random() * mock.responses.length)];
    }

    // Stateful POST
    if (mock.stateful) {
      stateStore[pathname] ??= [];
      const stored = applyTemplate(mock.body, reqBody);
      stateStore[pathname].push(stored);
      res.writeHead(mock.status ?? 201, { "content-type": "application/json" });
      return res.end(JSON.stringify(stored));
    }

    // Stateful GET
    if (method === "GET" && stateStore[pathname]) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(stateStore[pathname]));
    }

    res.writeHead(response.status ?? 200, response.headers ?? { "content-type": "application/json" });
    res.end(JSON.stringify(response.body ?? {}));
  });

  // Auto-port detection (H2)
  for (let i = 0; i < maxAttempts; i++) {
    try {
      server.listen(port);
      console.log(`🚀 MockGen running at http://localhost:${port}`);
      break;
    } catch (err: any) {
      if (err.code === "EADDRINUSE") port++;
      else throw err;
    }
  }

  // Expose helper to reload mocks (H3)
  server.reloadMocks = () => {
    mocks = loadMocks();
    console.log("♻️  Mocks reloaded!");
  };

  server.closeServer = (callback?: () => void) => server.close(callback);

  return server;

  function loadMocks(): Record<string, MockDefinition> {
    const mockFile = path.join(rootPath, ".mockgen", "mock.json");
    if (!fs.existsSync(mockFile)) return {};
    return JSON.parse(fs.readFileSync(mockFile, "utf-8"));
  }
}

// Extend server type
declare module "http" {
  interface Server {
    reloadMocks?: () => void;
    closeServer?: (callback?: () => void) => void;
  }
}
