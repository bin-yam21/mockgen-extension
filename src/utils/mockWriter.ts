import * as vscode from "vscode";
import * as path from "path";
import { generateMock } from "./mockGenerator";
import type { Endpoint } from "../types/endpoint";

export async function writeMocks(endpoints: Endpoint[]) {
  const root = vscode.workspace.workspaceFolders![0].uri;
  const mocksDir = vscode.Uri.joinPath(root, ".mockgen", "mocks");

  await vscode.workspace.fs.createDirectory(mocksDir);

  for (const e of endpoints) {
    const mock = generateMock(e);
    const fileName =
      `${e.method}_${e.url.replace(/[\/:]/g, "_")}.json`;

    const fileUri = vscode.Uri.joinPath(mocksDir, fileName);

    const content = Buffer.from(
      JSON.stringify(mock, null, 2),
      "utf8"
    );

    await vscode.workspace.fs.writeFile(fileUri, content);
  }
}
