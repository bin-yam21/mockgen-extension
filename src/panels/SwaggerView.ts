import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export function createSwaggerPanel(
  context: vscode.ExtensionContext,
  swaggerFilePath: string
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    "mockgenSwagger",
    "MockGen Swagger API",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  panel.webview.html = getSwaggerHtml(panel.webview, context, swaggerFilePath);

  return panel;
}

function getSwaggerHtml(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  swaggerFilePath: string
): string {
  const swaggerJson = fs.readFileSync(swaggerFilePath, "utf-8");

  const swaggerUiCss = "https://unpkg.com/swagger-ui-dist/swagger-ui.css";
  const swaggerUiBundle = "https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js";

  return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MockGen Swagger</title>
  <link rel="stylesheet" href="${swaggerUiCss}" />
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #1e1e1e;
    }
    #swagger-ui {
      background: white;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>

  <script src="${swaggerUiBundle}"></script>
  <script>
    const spec = ${swaggerJson};

    SwaggerUIBundle({
      spec,
      dom_id: "#swagger-ui",
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset
      ],
      layout: "BaseLayout"
    });
  </script>
</body>
</html>
`;
}
