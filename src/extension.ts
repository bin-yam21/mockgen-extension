import * as vscode from "vscode";
import * as path from "path";
import {
  scanEndpointsForWorkspace,
  formatEndpoints
} from "./utils/EndpointScanner";
import { createEndpointsPanel } from "./panels/EndpointsView";
import { writeEndpointsFile } from "./utils/filewriter";

export function activate(context: vscode.ExtensionContext) {
  console.log("MockGen extension active");

  // 1️⃣ Scan Endpoints
  const scanCommand = vscode.commands.registerCommand(
    "mockgen.scanEndpoints",
    async () => {
      const wf = vscode.workspace.workspaceFolders;
      if (!wf?.length) {
        vscode.window.showErrorMessage("Open a workspace folder first.");
        return;
      }

      const root = wf[0];
      const endpoints = await scanEndpointsForWorkspace(root);

      if (!endpoints.length) {
        vscode.window.showInformationMessage("No endpoints found.");
        return;
      }

      const formatted = formatEndpoints(endpoints, root);

      const outDir = vscode.Uri.joinPath(root.uri, ".mockgen");
      await vscode.workspace.fs.createDirectory(outDir);
      const outFile = vscode.Uri.joinPath(outDir, "endpoints.json");

      await vscode.workspace.fs.writeFile(
        outFile,
        Buffer.from(JSON.stringify(formatted, null, 2), "utf8")
      );

      vscode.window.showInformationMessage(
        `Found ${formatted.length} endpoints — saved to .mockgen/endpoints.json`
      );

      const doc = await vscode.workspace.openTextDocument(outFile);
      await vscode.window.showTextDocument(doc);
    }
  );

  // 2️⃣ Generate Mock API
  const generateMockCommand = vscode.commands.registerCommand(
    "mockgen.generateMockApi",
    async () => {
      const wf = vscode.workspace.workspaceFolders;
      if (!wf?.length) return;

      const root = wf[0];
      const endpoints = await scanEndpointsForWorkspace(root);
      if (!endpoints.length) return;

      const mock: Record<string, any> = {};
      for (const e of endpoints) {
        mock[e.url] = {
          method: e.method,
          response: {
            message: `Mock response for ${e.url}`,
            example:
              e.method === "GET"
                ? [{ id: 1, name: "example" }]
                : { id: 1, created: true }
          }
        };
      }

      const outDir = vscode.Uri.joinPath(root.uri, ".mockgen");
      await vscode.workspace.fs.createDirectory(outDir);
      const outFile = vscode.Uri.joinPath(outDir, "mock.json");

      await vscode.workspace.fs.writeFile(
        outFile,
        Buffer.from(JSON.stringify(mock, null, 2), "utf8")
      );

      const doc = await vscode.workspace.openTextDocument(outFile);
      await vscode.window.showTextDocument(doc);
    }
  );

  // 3️⃣ Show WebView Endpoint Report
  const showReportCommand = vscode.commands.registerCommand(
    "mockgen.showEndpointReport",
    async () => {
      const wf = vscode.workspace.workspaceFolders;
      if (!wf?.length) return;

      const root = wf[0];
      const endpoints = await scanEndpointsForWorkspace(root);

      const viewData = endpoints.map(e => ({
        method: e.method,
        url: e.url,
        location: `${path.relative(root.uri.fsPath, e.file)}:${e.line}`
      }));

      createEndpointsPanel(context, viewData);
    }
  );

  // 4️⃣ Export via WebView button
  const exportCommand = vscode.commands.registerCommand(
    "mockgen.exportEndpoints",
    async () => {
      const wf = vscode.workspace.workspaceFolders;
      if (!wf?.length) return;

      const endpoints = await scanEndpointsForWorkspace(wf[0]);
      await writeEndpointsFile(endpoints);
    }
  );

  context.subscriptions.push(
    scanCommand,
    generateMockCommand,
    showReportCommand,
    exportCommand
  );
}

export function deactivate() {}
