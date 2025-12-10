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
import { Project, SyntaxKind } from "ts-morph";

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

/**
 * Scan workspace for endpoints (fetch + axios + class methods)
 */
export async function scanEndpointsForWorkspace(
  workspaceFolder?: vscode.WorkspaceFolder
): Promise<Endpoint[]> {
  if (!workspaceFolder) return [];

  const patterns = ["**/*.js", "**/*.ts", "**/*.jsx", "**/*.tsx"];
  const exclude = "**/{node_modules,.git,dist,out,build,**/.mockgen/**}/**";

  const uris: vscode.Uri[] = [];
  for (const p of patterns) {
    const found = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, p),
      exclude
    );
    uris.push(...found);
  }

  const endpoints: Endpoint[] = [];

  // Regex for detecting calls
  const fetchRegex = /fetch\s*\(\s*([`'"])(.+?)\1/gs;
  const axiosDefaultRegex = /axios\.(get|post|put|delete|patch|head|options)\s*\(\s*([`'"])(.+?)\2/gi;
  const axiosCreateRegex = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*axios\.create\s*\(/gi;
  const axiosCallRegex = /([a-zA-Z_$][\w$]*)\.(get|post|put|delete|patch|head|options)\s*\(\s*([`'"])(.+?)\3/gi;

  for (const uri of uris) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(bytes).toString("utf8");

      // Step 6: Detect axios.create instances
      const instanceNames = new Set<string>();
      let match;
      axiosCreateRegex.lastIndex = 0;
      while ((match = axiosCreateRegex.exec(text)) !== null) {
        if (match[1]) instanceNames.add(match[1]);
      }

      // Step 5: Detect fetch()
      fetchRegex.lastIndex = 0;
      while ((match = fetchRegex.exec(text)) !== null) {
        endpoints.push({
          file: uri.fsPath,
          line: lineNumberFromIndex(text, match.index),
          url: match[2],
          method: "GET",
          raw: match[0],
        });
      }

      // Step 6: Detect default axios calls
      axiosDefaultRegex.lastIndex = 0;
      while ((match = axiosDefaultRegex.exec(text)) !== null) {
        endpoints.push({
          file: uri.fsPath,
          line: lineNumberFromIndex(text, match.index),
          url: match[3],
          method: (match[1] || "GET").toUpperCase(),
          raw: match[0],
        });
      }

      // Step 6: Detect axios instance calls
      axiosCallRegex.lastIndex = 0;
      while ((match = axiosCallRegex.exec(text)) !== null) {
        const instance = match[1];
        if (instance === "axios" || instanceNames.has(instance)) {
          endpoints.push({
            file: uri.fsPath,
            line: lineNumberFromIndex(text, match.index),
            url: match[4],
            method: (match[2] || "GET").toUpperCase(),
            raw: match[0],
          });
        }
      }

      // Step 7: Detect inside classes/services (TS only)
      if (uri.fsPath.endsWith(".ts") || uri.fsPath.endsWith(".tsx")) {
        const project = new Project({ skipAddingFilesFromTsConfig: true });
        const sourceFile = project.addSourceFileAtPath(uri.fsPath);

        for (const cls of sourceFile.getClasses()) {
          for (const method of cls.getMethods()) {
            const calls = method.getDescendantsOfKind(SyntaxKind.CallExpression);
            for (const call of calls) {
              const expr = call.getExpression().getText();

              // fetch() inside class
              if (expr === "fetch") {
                const url = call.getArguments()[0]?.getText()?.replace(/['"`]/g, "");
                endpoints.push({
                  file: uri.fsPath,
                  line: call.getStartLineNumber(),
                  url,
                  method: "GET",
                  raw: call.getText(),
                });
              }

              // default axios inside class
              if (expr.startsWith("axios.")) {
                const methodName = expr.split(".")[1].toUpperCase();
                const url = call.getArguments()[0]?.getText()?.replace(/['"`]/g, "");
                endpoints.push({
                  file: uri.fsPath,
                  line: call.getStartLineNumber(),
                  url,
                  method: methodName || "GET",
                  raw: call.getText(),
                });
              }

              // axios instance inside class
              if (instanceNames.has(expr)) {
                const methodName = call.getArguments()[1] ? "POST" : "GET";
                const url = call.getArguments()[0]?.getText()?.replace(/['"`]/g, "");
                endpoints.push({
                  file: uri.fsPath,
                  line: call.getStartLineNumber(),
                  url,
                  method: methodName,
                  raw: call.getText(),
                });
              }
            }
          }
        }
      }
    } catch (err) {
      // ignore read errors
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


 // Step 8: Format endpoints for display/export
 
export function formatEndpoints(endpoints: Endpoint[], workspaceFolder: vscode.WorkspaceFolder) {
  return endpoints.map(e => ({
    file: path.relative(workspaceFolder.uri.fsPath, e.file),
    line: e.line,
    url: e.url,
    method: e.method,
    raw: e.raw,
  }));
}


 // Optional: group endpoints by file
 
export function groupEndpointsByFile(formatted: ReturnType<typeof formatEndpoints>) {
  const grouped: Record<string, typeof formatted> = {};
  for (const e of formatted) {
    if (!grouped[e.file]) grouped[e.file] = [];
    grouped[e.file].push(e);
  }
  return grouped;
}
