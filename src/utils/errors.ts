// utils/errors.ts
import * as vscode from "vscode";

// Called when scan finds no endpoints
export function showEmptyState() {
  vscode.window.showInformationMessage(
    "No endpoints found. Make sure you opened a folder containing JS/TS files and try scanning again."
  );
}

// Called when scan or any command throws an error
export function showError(err: unknown) {
  console.error(err); // always log for devs
  vscode.window.showErrorMessage(
    "Oops! MockGen encountered an error. Check the console for details."
  );
}
