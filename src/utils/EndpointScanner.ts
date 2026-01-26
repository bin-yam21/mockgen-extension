import * as vscode from "vscode";
import * as path from "path";

/* =========================
   Types
========================= */
export type Endpoint = {
  file: string;
  line: number;
  url: string;
  method: string;
  raw?: string;
};

/* =========================
   Helpers
========================= */
function extractFetchMethod(options?: string): string {
  if (!options) return "GET";
  const match = options.match(/method\s*:\s*['"`](GET|POST|PUT|DELETE|PATCH)['"`]/i);
  return match ? match[1].toUpperCase() : "GET";
}

function lineNumberFromIndex(text: string, index: number) {
  return text.slice(0, index).split(/\r\n|\r|\n/).length;
}

/* =========================
   Formatter
========================= */
export function formatEndpoints(
  endpoints: Endpoint[],
  workspaceFolder: vscode.WorkspaceFolder
) {
  const root = workspaceFolder.uri.fsPath;

  return endpoints
    .map(e => ({
      file: path.relative(root, e.file),
      line: e.line,
      url: e.url.trim(),
      method: e.method.toUpperCase(),
      location: `${path.relative(root, e.file)}:${e.line}`,
      ...(e.raw ? { raw: e.raw } : {}),
    }))
    .sort((a, b) => {
      if (a.file !== b.file) return a.file.localeCompare(b.file);
      if (a.line !== b.line) return a.line - b.line;
      if (a.method !== b.method) return a.method.localeCompare(b.method);
      return a.url.localeCompare(b.url);
    });
}

/* =========================
   Scanner
========================= */
export async function scanEndpointsForWorkspace(
  workspaceFolder?: vscode.WorkspaceFolder
): Promise<Endpoint[]> {
  if (!workspaceFolder) return [];

  const patterns = ["**/*.js", "**/*.ts", "**/*.jsx", "**/*.tsx", "**/*.rs"];
  const exclude = "**/{node_modules,.git,dist,out,build,**/.mockgen/**}/**";

  const uris: vscode.Uri[] = [];
  for (const p of patterns) {
    uris.push(...(await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, p),
      exclude
    )));
  }

  const endpoints: Endpoint[] = [];

  /* =========================
     Regex Definitions
  ========================== */
  const fetchRegex = /fetch\s*\(\s*(['"`])([^'"`]+)\1\s*(?:,\s*({[\s\S]*?}))?\s*\)/g;

  // ✅ Robust Express regex
  const expressRouteRegex = /(app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

  const axiosCallRegex = /([a-zA-Z_$][\w$]*)\.(get|post|put|delete|patch|head|options)\s*\(\s*([`'"])(.+?)\3/gi;
  const axiosCreateRegex = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*axios\.create\s*\(/gi;
  const axiosDefaultRegex = /axios\.(get|post|put|delete|patch|head|options)\s*\(\s*([`'"])(.+?)\2/gi;
  const axiosConfigRegex = /axios\s*\(\s*{[\s\S]*?method\s*:\s*['"`](get|post|put|delete|patch)['"`][\s\S]*?url\s*:\s*['"`](.+?)['"`][\s\S]*?}\s*\)/gi;

  const actixResourceRegex = /web::resource\s*\(\s*["'](.+?)["']\s*\)/g;
  const actixRouteRegex = /\.route\s*\(\s*["'](.+?)["']\s*,\s*web::(get|post|put|delete|patch)/gi;
  const rocketRouteRegex = /#\[(get|post|put|delete|patch)\("(.+?)"\)\]/gi;
  const axumRouteRegex = /route\s*\(\s*["'](.+?)["']\s*,\s*(get|post|put|delete|patch)/gi;

  /* =========================
     Scan Each File
  ========================== */
  for (const uri of uris) {
    try {
      const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
      const instanceNames = new Set<string>();
      let m: RegExpExecArray | null;

      // Axios instances
      axiosCreateRegex.lastIndex = 0;
      while ((m = axiosCreateRegex.exec(text))) instanceNames.add(m[1]);

      // Fetch
      fetchRegex.lastIndex = 0;
      while ((m = fetchRegex.exec(text))) {
        endpoints.push({
          file: uri.fsPath,
          line: lineNumberFromIndex(text, m.index),
          url: m[2].trim(),
          method: extractFetchMethod(m[3]),
          raw: m[0],
        });
      }

      // Axios default
      axiosDefaultRegex.lastIndex = 0;
      while ((m = axiosDefaultRegex.exec(text))) {
        endpoints.push({
          file: uri.fsPath,
          line: lineNumberFromIndex(text, m.index),
          url: m[3],
          method: m[1].toUpperCase(),
          raw: m[0],
        });
      }

      // Axios config
      axiosConfigRegex.lastIndex = 0;
      while ((m = axiosConfigRegex.exec(text))) {
        endpoints.push({
          file: uri.fsPath,
          line: lineNumberFromIndex(text, m.index),
          url: m[2],
          method: m[1].toUpperCase(),
          raw: m[0],
        });
      }

      // Axios instance calls
      axiosCallRegex.lastIndex = 0;
      while ((m = axiosCallRegex.exec(text))) {
        if (m[1] === "axios" || instanceNames.has(m[1])) {
          endpoints.push({
            file: uri.fsPath,
            line: lineNumberFromIndex(text, m.index),
            url: m[4],
            method: m[2].toUpperCase(),
            raw: m[0],
          });
        }
      }

      // Rust / backend
      [actixResourceRegex, actixRouteRegex, rocketRouteRegex, axumRouteRegex].forEach(regex => {
        regex.lastIndex = 0;
        while ((m = regex.exec(text))) {
          const method = (m[2] || "GET").toUpperCase();
          const url = m[1] || m[2];
          if (url) endpoints.push({
            file: uri.fsPath,
            line: lineNumberFromIndex(text, m.index),
            url,
            method,
            raw: m[0],
          });
        }
      });

      // Express
      expressRouteRegex.lastIndex = 0;
      while ((m = expressRouteRegex.exec(text))) {
        endpoints.push({
          file: uri.fsPath,
          line: lineNumberFromIndex(text, m.index),
          url: m[3],
          method: m[2].toUpperCase(),
          raw: m[0],
        });
      }

    } catch {
      continue;
    }
  }

  // Deduplicate
  const map = new Map<string, Endpoint>();
  for (const e of endpoints) map.set(`${e.file}::${e.url}::${e.method}`, e);
  return Array.from(map.values());
}
