import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

import { generateMock } from "./utils/mockGenerator";
import {
  scanEndpointsForWorkspace,
  formatEndpoints,
} from "./utils/EndpointScanner";
import { writeEndpointsFile } from "./utils/filewriter";
import { createEndpointsPanel } from "./panels/EndpointsView";
import { showEmptyState, showError } from "./utils/errors";
import { startMockServer } from "./server/mockServer";
import { generateSwagger } from "./utils/swaggerGenerator";
import type { Endpoint } from "./types/endpoint";
import { createSwaggerPanel } from "./panels/SwaggerView";
import { DashboardPanel } from "./panels/DashboardPanel";
import { notifySuccess, notifyError, notifyWarn } from "./utils/notifications";

/* =========================
   Workspace Helper (CRITICAL FIX)
========================= */
function getWorkspace() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage(
      "MockGen: Open a folder (File → Open Folder) before running this command.",
    );
    return null;
  }
  return folders[0];
}

export function activate(context: vscode.ExtensionContext) {
  console.log("🚀 MockGen extension activated");

  let panel: vscode.WebviewPanel | undefined;
  let serverInstance: any;

  /* =========================
     Status Bar (Phase H)
  ========================= */
  const statusStart = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusStart.text = "▶ MockGen";
  statusStart.command = "mockgen.startMockServer";
  statusStart.tooltip = "Start Mock Server";

  const statusStop = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    99,
  );
  statusStop.text = "⏹ Stop";
  statusStop.command = "mockgen.stopMockServer";
  statusStop.tooltip = "Stop Mock Server";

  const statusReload = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    98,
  );
  statusReload.text = "🔄 Reload";
  statusReload.command = "mockgen.reloadMockServer";
  statusReload.tooltip = "Reload Mocks";

  context.subscriptions.push(statusStart, statusStop, statusReload);

  function updateStatus(running: boolean) {
    if (running) {
      statusStart.hide();
      statusStop.show();
      statusReload.show();
    } else {
      statusStart.show();
      statusStop.hide();
      statusReload.hide();
    }
  }

  updateStatus(false);
  statusStart.show();

  /* =========================
     1️⃣ Scan Endpoints
  ========================= */
  const scanCommand = vscode.commands.registerCommand(
    "mockgen.scanEndpoints",
    async () => {
      try {
        const workspace = getWorkspace();
        if (!workspace) return;

        const endpoints = await scanEndpointsForWorkspace(workspace);
        if (!endpoints.length) return showEmptyState();

        await writeEndpointsFile(endpoints);
        notifySuccess(`Found ${endpoints.length} endpoints`);

        if (panel) {
          panel.webview.postMessage({ type: "update", endpoints });
        }
      } catch (err) {
        showError(err);
      }
    },
  );

  /* =========================
     2️⃣ Generate Mock API
  ========================= */
  const generateMockCommand = vscode.commands.registerCommand(
    "mockgen.generateMockApi",
    async () => {
      try {
        const workspace = getWorkspace();
        if (!workspace) return;

        const workspaceRoot = workspace.uri.fsPath;
        const endpoints = await scanEndpointsForWorkspace(workspace);
        if (!endpoints.length) return showEmptyState();

        const formatted = formatEndpoints(endpoints, workspace);
        const mocks: Record<string, any> = {};

        for (const e of formatted) {
          mocks[e.url] = {
            method: e.method,
            ...generateMock(e, workspaceRoot),
          };
        }

        const outDir = path.join(workspaceRoot, ".mockgen");
        fs.mkdirSync(outDir, { recursive: true });

        const outFile = path.join(outDir, "mock.json");
        fs.writeFileSync(outFile, JSON.stringify(mocks, null, 2));

        const doc = await vscode.workspace.openTextDocument(outFile);
        await vscode.window.showTextDocument(doc);

        notifySuccess(`Generated mocks for ${formatted.length} endpoints`);
      } catch (err) {
        showError(err);
      }
    },
  );

  /* =========================
     3️⃣ Start Mock Server
  ========================= */
  const startServerCommand = vscode.commands.registerCommand(
    "mockgen.startMockServer",
    async () => {
      const workspace = getWorkspace();
      if (!workspace) return;

      if (serverInstance) {
        notifyWarn("Mock server already running");
        return;
      }

      try {
        serverInstance = startMockServer(workspace.uri.fsPath, 3000);
        updateStatus(true);
        notifySuccess("Mock server started on port 3000");
      } catch (err) {
        notifyError("Failed to start mock server");
      }
    },
  );

  /* =========================
     4️⃣ Stop Mock Server
  ========================= */
  const stopServerCommand = vscode.commands.registerCommand(
    "mockgen.stopMockServer",
    async () => {
      if (!serverInstance) {
        notifyWarn("Mock server not running");
        return;
      }

      serverInstance.closeServer?.();
      serverInstance = null;
      updateStatus(false);
      notifySuccess("Mock server stopped");
    },
  );

  /* =========================
     5️⃣ Reload Mocks
  ========================= */
  const reloadServerCommand = vscode.commands.registerCommand(
    "mockgen.reloadMockServer",
    async () => {
      if (!serverInstance) {
        notifyWarn("Mock server not running");
        return;
      }

      serverInstance.reloadMocks?.();
      notifySuccess("Mocks reloaded");
    },
  );

  /* =========================
     6️⃣ Endpoint Report
  ========================= */
  const showReportCommand = vscode.commands.registerCommand(
    "mockgen.showEndpointReport",
    async () => {
      const workspace = getWorkspace();
      if (!workspace) return;

      const endpoints = await scanEndpointsForWorkspace(workspace);
      const formatted = formatEndpoints(endpoints, workspace);
      if (!formatted.length) return showEmptyState();

      panel = createEndpointsPanel(context, formatted);
    },
  );

  /* =========================
     7️⃣ Swagger + Dashboard
  ========================= */
  const swaggerCommand = vscode.commands.registerCommand(
    "mockgen.generateSwagger",
    async () => {
      const workspace = getWorkspace();
      if (!workspace) return;

      const endpointsFile = path.join(
        workspace.uri.fsPath,
        ".mockgen",
        "endpoints.json",
      );
      if (!fs.existsSync(endpointsFile)) return showEmptyState();

      const endpoints: Endpoint[] = JSON.parse(
        fs.readFileSync(endpointsFile, "utf-8"),
      );

      const swaggerFile = generateSwagger(endpoints, workspace.uri.fsPath);
      const doc = await vscode.workspace.openTextDocument(swaggerFile);
      await vscode.window.showTextDocument(doc);

      notifySuccess("Swagger generated");
    },
  );

  const viewSwaggerCommand = vscode.commands.registerCommand(
    "mockgen.viewSwagger",
    async () => {
      const workspace = getWorkspace();
      if (!workspace) return;

      const swaggerFile = path.join(
        workspace.uri.fsPath,
        ".mockgen",
        "swagger.json",
      );
      if (!fs.existsSync(swaggerFile)) {
        notifyError("Swagger not found");
        return;
      }

      createSwaggerPanel(context, swaggerFile);
    },
  );

  const dashboardCommand = vscode.commands.registerCommand(
    "mockgen.viewDashboard",
    async () => {
      const workspace = getWorkspace();
      if (!workspace) return;

      const root = workspace.uri.fsPath;
      const endpointsFile = path.join(root, ".mockgen", "endpoints.json");
      const swaggerFile = path.join(root, ".mockgen", "swagger.json");

      if (!fs.existsSync(endpointsFile) || !fs.existsSync(swaggerFile)) {
        notifyError("Generate endpoints & Swagger first");
        return;
      }

      const endpoints = JSON.parse(fs.readFileSync(endpointsFile, "utf-8"));
      const swagger = JSON.parse(fs.readFileSync(swaggerFile, "utf-8"));

      DashboardPanel.show(context, endpoints, swagger, root);
    },
  );

  context.subscriptions.push(
    scanCommand,
    generateMockCommand,
    startServerCommand,
    stopServerCommand,
    reloadServerCommand,
    showReportCommand,
    swaggerCommand,
    viewSwaggerCommand,
    dashboardCommand,
  );
}

export function deactivate() {
  // server cleanup handled by VS Code
}
