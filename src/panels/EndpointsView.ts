import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export type Endpoint = {
  method?: string;
  url: string;
  location?: string;
  meta?: Record<string, any>;
};

let panel: vscode.WebviewPanel | undefined;

export function createEndpointsPanel(
  context: vscode.ExtensionContext,
  endpoints: Endpoint[]
) {
  if (panel) {
    panel.reveal();
    panel.webview.postMessage({ type: 'update', endpoints });
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'mockgenEndpoints',
    'MockGen: Endpoint Report',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'webview'),
      ],
    }
  );

  const htmlPath = vscode.Uri.joinPath(
    context.extensionUri,
    'webview',
    'Endpoints.html'
  );

  let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
  html = html.replace(
    'INITIAL_STATE',
    JSON.stringify({ endpoints })
  );

  panel.webview.html = html;

  panel.webview.onDidReceiveMessage((msg) => {
    if (msg.type === 'export') {
      vscode.commands.executeCommand('mockgen.exportEndpoints');
    }

    if (msg.type === 'openFile' && msg.location) {
      openFileAtLocation(msg.location);
    }
  });

  panel.onDidDispose(() => (panel = undefined));
}

async function openFileAtLocation(location: string) {
  const [filePath, lineStr] = location.split(':');
  const line = Math.max(0, Number(lineStr || 1) - 1);

  const uri = path.isAbsolute(filePath)
    ? vscode.Uri.file(filePath)
    : vscode.Uri.joinPath(
        vscode.workspace.workspaceFolders![0].uri,
        filePath
      );

  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);

  const pos = new vscode.Position(line, 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos));
}
