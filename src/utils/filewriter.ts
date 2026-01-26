import * as vscode from "vscode";
import type { Endpoint } from "../utils/EndpointScanner";
import { formatEndpoints } from "../utils/EndpointScanner";

export async function writeEndpointsFile(
  rawEndpoints: Endpoint[]
) {
  try {
    if (!vscode.workspace.workspaceFolders?.length) {
      throw new Error("MockGen: No workspace is open.");
    }

    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const root = workspaceFolder.uri;

    /* ✅ A6: Always format before export */
    const formatted = formatEndpoints(rawEndpoints, workspaceFolder);

    /* ✅ A6: Single source of truth */
    const dir = vscode.Uri.joinPath(root, ".mockgen");
    const file = vscode.Uri.joinPath(dir, "endpoints.json");

    /* ✅ Ensure directory exists */
    await vscode.workspace.fs.createDirectory(dir);

    const content = Buffer.from(
      JSON.stringify(formatted, null, 2),
      "utf8"
    );

    /* ✅ Safe overwrite */
    await vscode.workspace.fs.writeFile(file, content);

    vscode.window.showInformationMessage(
      `MockGen: Exported ${formatted.length} endpoints → .mockgen/endpoints.json`
    );
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `MockGen Export Failed: ${err.message || err}`
    );
    throw err;
  }
}
