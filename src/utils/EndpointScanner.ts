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
  const match = options.match(
    /method\s*:\s*['"`](GET|POST|PUT|DELETE|PATCH)['"`]/i,
  );
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
  workspaceFolder: vscode.WorkspaceFolder,
) {
  const root = workspaceFolder.uri.fsPath;

  return endpoints
    .map((e) => ({
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
  workspaceFolder?: vscode.WorkspaceFolder,
): Promise<Endpoint[]> {
  if (!workspaceFolder) return [];

  const patterns = ["**/*.js", "**/*.ts", "**/*.jsx", "**/*.tsx", "**/*.rs"];
  const exclude = "**/{node_modules,.git,dist,out,build,**/.mockgen/**}/**";

  const uris: vscode.Uri[] = [];
  for (const p of patterns) {
    uris.push(
      ...(await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, p),
        exclude,
      )),
    );
  }

  const endpoints: Endpoint[] = [];

  /* =========================
     Regex Definitions
  ========================== */
  // Enhanced fetch regex - supports template literals and Request objects
  const fetchRegex =
    /fetch\s*\(\s*(?:new\s+Request\s*\(\s*)?(['"`])([^'"`]+)\1(?:\s*\))?\s*(?:,\s*({[\s\S]*?}))?\s*\)/g;
  const fetchTemplateRegex =
    /fetch\s*\(\s*`([^`]+)`\s*(?:,\s*({[\s\S]*?}))?\s*\)/g;

  // ✅ Robust Express regex
  const expressRouteRegex =
    /(app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

  // Enhanced axios patterns - support template literals
  const axiosCallRegex =
    /([a-zA-Z_$][\w$]*)\.(get|post|put|delete|patch|head|options)\s*\(\s*([`'"])(.+?)\3/gi;
  const axiosCallTemplateRegex =
    /([a-zA-Z_$][\w$]*)\.(get|post|put|delete|patch|head|options)\s*\(\s*`([^`]+)`/gi;
  const axiosCreateRegex =
    /(?:const|let|var|import)\s+([a-zA-Z_$][\w$]*)\s*=\s*axios\.create\s*\(/gi;
  const axiosImportRegex =
    /import\s+(?:{?\s*default\s+as\s+)?([a-zA-Z_$][\w$]*)\s*(?:}?)?\s+from\s+['"]axios['"]/gi;
  const axiosDefaultRegex =
    /axios\.(get|post|put|delete|patch|head|options)\s*\(\s*([`'"])(.+?)\2/gi;
  const axiosDefaultTemplateRegex =
    /axios\.(get|post|put|delete|patch|head|options)\s*\(\s*`([^`]+)`/gi;
  const axiosConfigRegex =
    /axios\s*\(\s*{[\s\S]*?method\s*:\s*['"`](get|post|put|delete|patch)['"`][\s\S]*?url\s*:\s*['"`](.+?)['"`][\s\S]*?}\s*\)/gi;
  const axiosConfigTemplateRegex =
    /axios\s*\(\s*{[\s\S]*?method\s*:\s*['"`](get|post|put|delete|patch)['"`][\s\S]*?url\s*:\s*`([^`]+)`[\s\S]*?}\s*\)/gi;

  // React Query / TanStack Query patterns
  // Look for queryFn/mutationFn followed by axios/fetch calls (within 500 chars)
  // This handles multi-line patterns better
  const reactQueryContextRegex =
    /(?:queryFn|mutationFn|queryFnAsync|mutationFnAsync)\s*:[\s\S]{0,500}?([a-zA-Z_$][\w$]*)\.(get|post|put|delete|patch|head|options)\s*\(\s*([`'"])(.+?)\3/gi;
  const reactQueryContextTemplateRegex =
    /(?:queryFn|mutationFn|queryFnAsync|mutationFnAsync)\s*:[\s\S]{0,500}?([a-zA-Z_$][\w$]*)\.(get|post|put|delete|patch|head|options)\s*\(\s*`([^`]+)`/gi;
  const reactQueryFetchContextRegex =
    /(?:queryFn|mutationFn|queryFnAsync|mutationFnAsync)\s*:[\s\S]{0,500}?fetch\s*\(\s*([`'"])([^'"`]+)\1/gi;
  const reactQueryFetchContextTemplateRegex =
    /(?:queryFn|mutationFn|queryFnAsync|mutationFnAsync)\s*:[\s\S]{0,500}?fetch\s*\(\s*`([^`]+)`/gi;

  // API client patterns (common wrapper names)
  const apiClientRegex =
    /(?:api|client|http|request|httpClient|apiClient)\.(get|post|put|delete|patch|head|options)\s*\(\s*([`'"])(.+?)\2/gi;
  const apiClientTemplateRegex =
    /(?:api|client|http|request|httpClient|apiClient)\.(get|post|put|delete|patch|head|options)\s*\(\s*`([^`]+)`/gi;

  const actixResourceRegex = /web::resource\s*\(\s*["'](.+?)["']\s*\)/g;
  const actixRouteRegex =
    /\.route\s*\(\s*["'](.+?)["']\s*,\s*web::(get|post|put|delete|patch)/gi;
  const rocketRouteRegex = /#\[(get|post|put|delete|patch)\("(.+?)"\)\]/gi;
  const axumRouteRegex =
    /route\s*\(\s*["'](.+?)["']\s*,\s*(get|post|put|delete|patch)/gi;

  /* =========================
     Scan Each File
  ========================== */
  for (const uri of uris) {
    try {
      const text = Buffer.from(
        await vscode.workspace.fs.readFile(uri),
      ).toString("utf8");
      const instanceNames = new Set<string>();
      const axiosAliases = new Set<string>(["axios"]);
      let m: RegExpExecArray | null;

      // Detect axios imports (including default imports)
      axiosImportRegex.lastIndex = 0;
      while ((m = axiosImportRegex.exec(text))) {
        axiosAliases.add(m[1]);
      }

      // Axios instances (create, import, etc.)
      axiosCreateRegex.lastIndex = 0;
      while ((m = axiosCreateRegex.exec(text))) {
        instanceNames.add(m[1]);
        axiosAliases.add(m[1]);
      }

      // Standard fetch with quotes
      fetchRegex.lastIndex = 0;
      while ((m = fetchRegex.exec(text))) {
        const url = m[2].trim();
        if (url && !url.includes("${")) {
          // Skip if it's a template with interpolation we can't handle
          endpoints.push({
            file: uri.fsPath,
            line: lineNumberFromIndex(text, m.index),
            url,
            method: extractFetchMethod(m[3]),
            raw: m[0],
          });
        }
      }

      // Fetch with template literals
      fetchTemplateRegex.lastIndex = 0;
      while ((m = fetchTemplateRegex.exec(text))) {
        let url = m[1];
        // Replace template expressions with placeholders
        url = url.replace(/\$\{[^}]+\}/g, ":id");
        url = url.trim();
        if (url) {
          endpoints.push({
            file: uri.fsPath,
            line: lineNumberFromIndex(text, m.index),
            url,
            method: extractFetchMethod(m[2]),
            raw: m[0],
          });
        }
      }

      // Axios default with quotes
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

      // Axios default with template literals
      axiosDefaultTemplateRegex.lastIndex = 0;
      while ((m = axiosDefaultTemplateRegex.exec(text))) {
        let url = m[2];
        url = url.replace(/\$\{[^}]+\}/g, ":id").trim();
        if (url) {
          endpoints.push({
            file: uri.fsPath,
            line: lineNumberFromIndex(text, m.index),
            url,
            method: m[1].toUpperCase(),
            raw: m[0],
          });
        }
      }

      // Axios config with quotes
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

      // Axios config with template literals
      axiosConfigTemplateRegex.lastIndex = 0;
      while ((m = axiosConfigTemplateRegex.exec(text))) {
        let url = m[2];
        url = url.replace(/\$\{[^}]+\}/g, ":id").trim();
        if (url) {
          endpoints.push({
            file: uri.fsPath,
            line: lineNumberFromIndex(text, m.index),
            url,
            method: m[1].toUpperCase(),
            raw: m[0],
          });
        }
      }

      // Axios instance calls with quotes
      axiosCallRegex.lastIndex = 0;
      while ((m = axiosCallRegex.exec(text))) {
        if (axiosAliases.has(m[1]) || instanceNames.has(m[1])) {
          endpoints.push({
            file: uri.fsPath,
            line: lineNumberFromIndex(text, m.index),
            url: m[4],
            method: m[2].toUpperCase(),
            raw: m[0],
          });
        }
      }

      // Axios instance calls with template literals
      axiosCallTemplateRegex.lastIndex = 0;
      while ((m = axiosCallTemplateRegex.exec(text))) {
        if (axiosAliases.has(m[1]) || instanceNames.has(m[1])) {
          let url = m[3];
          url = url.replace(/\$\{[^}]+\}/g, ":id").trim();
          if (url) {
            endpoints.push({
              file: uri.fsPath,
              line: lineNumberFromIndex(text, m.index),
              url,
              method: m[2].toUpperCase(),
              raw: m[0],
            });
          }
        }
      }

      // React Query with axios (quotes) - context-aware
      reactQueryContextRegex.lastIndex = 0;
      while ((m = reactQueryContextRegex.exec(text))) {
        if (axiosAliases.has(m[1]) || instanceNames.has(m[1])) {
          endpoints.push({
            file: uri.fsPath,
            line: lineNumberFromIndex(text, m.index),
            url: m[4],
            method: m[2].toUpperCase(),
            raw: m[0],
          });
        }
      }

      // React Query with axios (template literals) - context-aware
      reactQueryContextTemplateRegex.lastIndex = 0;
      while ((m = reactQueryContextTemplateRegex.exec(text))) {
        if (axiosAliases.has(m[1]) || instanceNames.has(m[1])) {
          let url = m[3];
          url = url.replace(/\$\{[^}]+\}/g, ":id").trim();
          if (url) {
            endpoints.push({
              file: uri.fsPath,
              line: lineNumberFromIndex(text, m.index),
              url,
              method: m[2].toUpperCase(),
              raw: m[0],
            });
          }
        }
      }

      // React Query with fetch (quotes) - context-aware
      reactQueryFetchContextRegex.lastIndex = 0;
      while ((m = reactQueryFetchContextRegex.exec(text))) {
        const url = m[2].trim();
        if (url && !url.includes("${")) {
          endpoints.push({
            file: uri.fsPath,
            line: lineNumberFromIndex(text, m.index),
            url,
            method: "GET", // Default for queryFn
            raw: m[0],
          });
        }
      }

      // React Query with fetch (template literals) - context-aware
      reactQueryFetchContextTemplateRegex.lastIndex = 0;
      while ((m = reactQueryFetchContextTemplateRegex.exec(text))) {
        let url = m[1];
        url = url.replace(/\$\{[^}]+\}/g, ":id").trim();
        if (url) {
          endpoints.push({
            file: uri.fsPath,
            line: lineNumberFromIndex(text, m.index),
            url,
            method: "GET", // Default for queryFn
            raw: m[0],
          });
        }
      }

      // API client patterns (quotes)
      apiClientRegex.lastIndex = 0;
      while ((m = apiClientRegex.exec(text))) {
        endpoints.push({
          file: uri.fsPath,
          line: lineNumberFromIndex(text, m.index),
          url: m[3],
          method: m[1].toUpperCase(),
          raw: m[0],
        });
      }

      // API client patterns (template literals)
      apiClientTemplateRegex.lastIndex = 0;
      while ((m = apiClientTemplateRegex.exec(text))) {
        let url = m[2];
        url = url.replace(/\$\{[^}]+\}/g, ":id").trim();
        if (url) {
          endpoints.push({
            file: uri.fsPath,
            line: lineNumberFromIndex(text, m.index),
            url,
            method: m[1].toUpperCase(),
            raw: m[0],
          });
        }
      }

      // Rust / backend
      [
        actixResourceRegex,
        actixRouteRegex,
        rocketRouteRegex,
        axumRouteRegex,
      ].forEach((regex) => {
        regex.lastIndex = 0;
        while ((m = regex.exec(text))) {
          const method = (m[2] || "GET").toUpperCase();
          const url = m[1] || m[2];
          if (url)
            endpoints.push({
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
