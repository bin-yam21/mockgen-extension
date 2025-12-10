import * as vscode from "vscode";
import * as path from "path";
import { scanEndpointsForWorkspace, formatEndpoints, Endpoint } from "./utils/EndpointScanner";

export function activate(context: vscode.ExtensionContext) {
  console.log("MockGen extension active");

  // Command: Scan Endpoints
  const scanCommand = vscode.commands.registerCommand("mockgen.scanEndpoints", async () => {
    const wf = vscode.workspace.workspaceFolders;
    if (!wf || wf.length === 0) {
      vscode.window.showErrorMessage("Open a workspace folder first to scan endpoints.");
      return;
    }
    const root = wf[0];

    await vscode.window.withProgress({ title: "Scanning project for API endpoints...", location: vscode.ProgressLocation.Notification }, async (progress) => {
      progress.report({ message: "Scanning files..." });
      const endpoints = await scanEndpointsForWorkspace(root);

      if (endpoints.length === 0) {
        vscode.window.showInformationMessage("No endpoints found in the workspace.");
        return;
      }

      // Step 8: format endpoints
      const formatted = formatEndpoints(endpoints, root);

      // Save to JSON
      try {
        const outFolder = vscode.Uri.joinPath(root.uri, ".mockgen");
        await vscode.workspace.fs.createDirectory(outFolder);
        const outFile = vscode.Uri.joinPath(outFolder, "endpoints.json");
        await vscode.workspace.fs.writeFile(outFile, Buffer.from(JSON.stringify(formatted, null, 2), "utf8"));

        vscode.window.showInformationMessage(`Found ${formatted.length} endpoints — saved to .mockgen/endpoints.json`);
        const doc = await vscode.workspace.openTextDocument(outFile);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to save endpoints: ${String(err)}`);
      }
    });
  });

  // Command: Generate Mock API (optional)
  const genCommand = vscode.commands.registerCommand("mockgen.generateMockApi", async () => {
    const wf = vscode.workspace.workspaceFolders;
    if (!wf || wf.length === 0) {
      vscode.window.showErrorMessage("Open a workspace folder first.");
      return;
    }
    const root = wf[0];

    const endpoints = await scanEndpointsForWorkspace(root);
    if (!endpoints.length) {
      vscode.window.showWarningMessage("No endpoints found to generate mock from.");
      return;
    }

    const mockObj: Record<string, any> = {};
    for (const e of endpoints) {
      const method = e.method || (e.url.includes("create") || e.raw?.includes("POST") ? "POST" : "GET");
      mockObj[e.url] = {
        method,
        response: {
          message: `Mock response for ${e.url}`,
          example: method === "GET" ? [{ id: 1, name: "example" }] : { id: 1, created: true },
        }
      };
    }

    const fileName = await vscode.window.showInputBox({ prompt: "Mock file name", value: "mock.json" });
    if (!fileName) return;

    try {
      const outFolder = vscode.Uri.joinPath(root.uri, ".mockgen");
      await vscode.workspace.fs.createDirectory(outFolder);
      const outFile = vscode.Uri.joinPath(outFolder, fileName);
      await vscode.workspace.fs.writeFile(outFile, Buffer.from(JSON.stringify(mockObj, null, 2), "utf8"));
      vscode.window.showInformationMessage(`Mock file created: .mockgen/${fileName}`);
      const doc = await vscode.workspace.openTextDocument(outFile);
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to create mock file: ${String(err)}`);
    }
  });

  context.subscriptions.push(scanCommand, genCommand);
}

export function deactivate() {}
