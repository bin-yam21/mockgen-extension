import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "mockgen" is now active!');

  const disposable = vscode.commands.registerCommand(
    "mockgen.generateMockApi",
    async () => {
      const editor = vscode.window.activeTextEditor;

      // 1. Get selected text (or entire file if nothing selected)
      let selectedText = editor?.document.getText(editor.selection) || "";
      if (!selectedText.trim()) {
        selectedText = editor?.document.getText() || "";
      }

      // 2. Ask for mock file name
      const fileName = await vscode.window.showInputBox({
        prompt: "Enter mock API file name (e.g., userMock.json)",
        placeHolder: "userMock.json",
        value: "mock.json",
      });

      if (!fileName) return;

      // 3. Ask where to save (choose folder)
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: "Select folder to save mock file"
      });

      if (!folderUri || folderUri.length === 0) return;

      const folderPath = folderUri[0].fsPath;
      const filePath = path.join(folderPath, fileName);

      // 4. Create JSON mock
      const mockContent = {
        mock: selectedText || "no content selected",
        createdAt: new Date().toISOString(),
      };

      fs.writeFileSync(filePath, JSON.stringify(mockContent, null, 2), "utf-8");

      vscode.window.showInformationMessage(`Mock API file created: ${fileName}`);
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
