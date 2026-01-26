import * as vscode from "vscode";

export function notifySuccess(message: string) {
  vscode.window.showInformationMessage(`✅ MockGen: ${message}`);
}

export function notifyError(message: string, err?: unknown) {
  console.error("MockGen Error:", err);
  vscode.window.showErrorMessage(`❌ MockGen: ${message}`);
}

export function notifyWarn(message: string) {
  vscode.window.showWarningMessage(`⚠️ MockGen: ${message}`);
}
