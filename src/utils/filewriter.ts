import * as vscode from 'vscode';
import type { Endpoint } from '../panels/EndpointsView';

export async function writeEndpointsFile(endpoints: Endpoint[]) {
  if (!vscode.workspace.workspaceFolders?.length) {
    throw new Error('MockGen: No workspace is open.');
  }

  const root = vscode.workspace.workspaceFolders[0].uri;
  const dir = vscode.Uri.joinPath(root, 'mockgen');
  const file = vscode.Uri.joinPath(dir, 'endpoints.json');

  await vscode.workspace.fs.createDirectory(dir);

  const content = Buffer.from(
    JSON.stringify(endpoints, null, 2),
    'utf8'
  );

  await vscode.workspace.fs.writeFile(file, content);

  vscode.window.showInformationMessage(
    'MockGen: endpoints.json exported successfully'
  );
}
