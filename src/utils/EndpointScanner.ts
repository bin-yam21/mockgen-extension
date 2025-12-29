// import { Project, SyntaxKind } from "ts-morph";

// export function scanEndpoints(tsConfigPath: string) {
//     const project = new Project({
//         tsConfigFilePath: tsConfigPath,
//         skipAddingFilesFromTsConfig: false,
//     });

//     // Load files
//     // project.addSourceFilesAtPaths("**/*.ts");
//     // project.addSourceFilesAtPaths("**/*.js");

//     const results: string[] = [];

//     for (const file of project.getSourceFiles()) {
//         const calls = file.getDescendantsOfKind(SyntaxKind.CallExpression);

//         for (const call of calls) {
//             const expression = call.getExpression().getText();

//             if (expression === "fetch") {
//                 const args = call.getArguments();
//                 const url = args[0]?.getText()?.replace(/['"`]/g, "") || "";
//                 results.push(url);
//             }
//         }
//     }

//     return results;
// }


import * as vscode from "vscode";
import * as path from "path";

export function formatEndpoints(endpoints: Endpoint[], workspaceFolder: vscode.WorkspaceFolder) {
  return endpoints.map(e => ({
    file: path.relative(workspaceFolder.uri.fsPath, e.file),
    line: e.line,
    url: e.url,
    method: e.method,
    raw: e.raw,
  }));
}

export type Endpoint = {
  file: string;
  line: number;
  url: string;
  method: string;
  raw?: string;
};

function lineNumberFromIndex(text: string, index: number) {
  return text.slice(0, index).split(/\r\n|\r|\n/).length;
}

export async function scanEndpointsForWorkspace(workspaceFolder?: vscode.WorkspaceFolder): Promise<Endpoint[]> {
  if (!workspaceFolder) return [];

  const patterns = [
    "**/*.js",
    "**/*.ts",
    "**/*.jsx",
    "**/*.tsx",
    "**/*.rs"     // 🔥 NEW: Scan Rust files
  ];

  const exclude = "**/{node_modules,.git,dist,out,build,**/.mockgen/**}/**";

  const uris: vscode.Uri[] = [];
  for (const p of patterns) {
    const found = await vscode.workspace.findFiles(new vscode.RelativePattern(workspaceFolder, p), exclude);
    uris.push(...found);
  }

  const endpoints: Endpoint[] = [];

  // -------------------------
  // JavaScript / TypeScript regex
  // -------------------------
  const fetchRegex = /fetch\s*\(\s*([`'"])(.+?)\1/gs;
  const axiosCallRegex = /([a-zA-Z_$][\w$]*)\.(get|post|put|delete|patch|head|options)\s*\(\s*([`'"])(.+?)\3/gi;
  const axiosCreateRegex = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*axios\.create\s*\(/gi;
  const axiosDefaultRegex = /axios\.(get|post|put|delete|patch|head|options)\s*\(\s*([`'"])(.+?)\2/gi;

  // -------------------------
  // Rust regex patterns
  // -------------------------

  // ⭐ Actix: web::resource("/api/users")
  const actixResourceRegex = /web::resource\s*\(\s*["'](.+?)["']\s*\)/g;

  // ⭐ Actix: .route("/login", web::post().to(handler))
  const actixRouteRegex = /\.route\s*\(\s*["'](.+?)["']\s*,\s*web::(get|post|put|delete|patch)/gi;

  // ⭐ Rocket: #[get("/api/users")]
  const rocketRouteRegex = /#\[(get|post|put|delete|patch)\("(.+?)"\)\]/gi;

  // ⭐ Axum: route("/api/users", get(handler))
  const axumRouteRegex = /route\s*\(\s*["'](.+?)["']\s*,\s*(get|post|put|delete|patch)/gi;

  for (const uri of uris) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(bytes).toString("utf8");

      // -----------------------
      // JS/TS: axios.create instances
      // -----------------------
      const instanceNames = new Set<string>();
      let m;

      axiosCreateRegex.lastIndex = 0;
      while ((m = axiosCreateRegex.exec(text)) !== null) {
        instanceNames.add(m[1]);
      }

      // -----------------------
      // JS/TS: fetch()
      // -----------------------
      fetchRegex.lastIndex = 0;
      while ((m = fetchRegex.exec(text)) !== null) {
        endpoints.push({
          file: uri.fsPath,
          line: lineNumberFromIndex(text, m.index),
          url: m[2],
          method: "GET",
          raw: m[0],
        });
      }

      // -----------------------
      // JS/TS: axios.default
      // -----------------------
      axiosDefaultRegex.lastIndex = 0;
      while ((m = axiosDefaultRegex.exec(text)) !== null) {
        endpoints.push({
          file: uri.fsPath,
          line: lineNumberFromIndex(text, m.index),
          url: m[3],
          method: m[1].toUpperCase(),
          raw: m[0],
        });
      }

      // -----------------------
      // JS/TS: axios instance calls
      // -----------------------
      axiosCallRegex.lastIndex = 0;
      while ((m = axiosCallRegex.exec(text)) !== null) {
        const instance = m[1];
        if (instance === "axios" || instanceNames.has(instance)) {
          endpoints.push({
            file: uri.fsPath,
            line: lineNumberFromIndex(text, m.index),
            url: m[4],
            method: m[2].toUpperCase(),
            raw: m[0],
          });
        }
      }

      // -----------------------
      // RUST: Actix (web::resource)
      // -----------------------
      actixResourceRegex.lastIndex = 0;
      while ((m = actixResourceRegex.exec(text)) !== null) {
        endpoints.push({
          file: uri.fsPath,
          line: lineNumberFromIndex(text, m.index),
          url: m[1],
          method: "GET",
          raw: m[0],
        });
      }

      // -----------------------
      // RUST: Actix (route)
      // -----------------------
      actixRouteRegex.lastIndex = 0;
      while ((m = actixRouteRegex.exec(text)) !== null) {
        endpoints.push({
          file: uri.fsPath,
          line: lineNumberFromIndex(text, m.index),
          url: m[1],
          method: m[2].toUpperCase(),
          raw: m[0],
        });
      }

      // -----------------------
      // RUST: Rocket #[get("/x")]
      // -----------------------
      rocketRouteRegex.lastIndex = 0;
      while ((m = rocketRouteRegex.exec(text)) !== null) {
        endpoints.push({
          file: uri.fsPath,
          line: lineNumberFromIndex(text, m.index),
          url: m[2],
          method: m[1].toUpperCase(),
          raw: m[0],
        });
      }

      // -----------------------
      // RUST: Axum route("/x", get)
      // -----------------------
      axumRouteRegex.lastIndex = 0;
      while ((m = axumRouteRegex.exec(text)) !== null) {
        endpoints.push({
          file: uri.fsPath,
          line: lineNumberFromIndex(text, m.index),
          url: m[1],
          method: m[2].toUpperCase(),
          raw: m[0],
        });
      }

    } catch (err) {
      continue;
    }
  }

  // Deduplicate
  const map = new Map<string, Endpoint>();
  for (const e of endpoints) {
    const key = `${e.file}::${e.url}::${e.method}`;
    if (!map.has(key)) map.set(key, e);
  }

  return Array.from(map.values());
}
