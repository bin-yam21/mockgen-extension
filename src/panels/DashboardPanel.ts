import * as vscode from "vscode";
import type { Endpoint } from "../types/endpoint";
import * as path from "path";
import * as fs from "fs";

/**
 * DashboardPanel
 * Shows Endpoints + Swagger tabs with search, filter, and download options
 */
export class DashboardPanel {
  private static currentPanel: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private mocksWatcher: fs.FSWatcher | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private endpoints: Endpoint[],
    private swaggerJson: any,
    private workspaceRoot: string,
  ) {
    this.panel = panel;

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /** Show the dashboard (singleton) */
  public static show(
    context: vscode.ExtensionContext,
    endpoints: Endpoint[],
    swaggerJson: any,
    workspaceRoot: string,
  ) {
    const column =
      vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      DashboardPanel.currentPanel.update(endpoints, swaggerJson);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "mockgenDashboard",
      "MockGen Dashboard",
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    DashboardPanel.currentPanel = new DashboardPanel(
      panel,
      context,
      endpoints,
      swaggerJson,
      workspaceRoot,
    );
  }

  /** Update the dashboard */
  public update(endpoints: Endpoint[], swaggerJson: any) {
    this.endpoints = endpoints;
    this.swaggerJson = swaggerJson;
    this.panel.webview.postMessage({ type: "updateEndpoints", endpoints });
    this.panel.webview.postMessage({ type: "updateSwagger", swaggerJson });
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case "downloadSwagger":
        this.openLocalFile(
          ".mockgen/swagger.json",
          "Swagger JSON opened in editor.",
        );
        break;

      case "downloadMocks":
        this.openLocalFile(
          ".mockgen/mock.json",
          "Mock bundle opened in editor.",
        );
        break;

      case "updateMock":
        this.persistMock(msg.endpoint, msg.newMock);
        break;

      case "openEditMock":
        this.openEditorForMock(msg.endpoint, msg.mock);
        break;

      case "copyEndpoint":
        vscode.env.clipboard
          .writeText(msg.url)
          .then(() =>
            vscode.window.showInformationMessage(
              `Copied endpoint URL: ${msg.url}`,
            ),
          );
        break;
    }
  }

  private async openLocalFile(relativePath: string, successMessage: string) {
    const fullPath = path.join(this.workspaceRoot, relativePath);
    if (!fs.existsSync(fullPath)) {
      vscode.window.showErrorMessage(
        `MockGen: File not found at ${relativePath}. Generate assets first.`,
      );
      return;
    }
    try {
      const doc = await vscode.workspace.openTextDocument(fullPath);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(successMessage);
    } catch (err) {
      // Fallback to external if opening in editor fails
      vscode.env.openExternal(vscode.Uri.file(fullPath));
      vscode.window.showInformationMessage(successMessage);
    }
  }

  private persistMock(endpointUrl: string, mockBody: any) {
    const mocksPath = path.join(this.workspaceRoot, ".mockgen", "mock.json");
    const dir = path.dirname(mocksPath);
    fs.mkdirSync(dir, { recursive: true });

    let mocks: Record<string, any> = {};
    if (fs.existsSync(mocksPath)) {
      try {
        mocks = JSON.parse(fs.readFileSync(mocksPath, "utf-8"));
      } catch {
        // fall back to empty if corrupted
      }
    }

    mocks[endpointUrl] = {
      ...(mocks[endpointUrl] || {}),
      body: mockBody?.body ?? mockBody,
      status: mockBody?.status ?? mocks[endpointUrl]?.status ?? 200,
    };

    fs.writeFileSync(mocksPath, JSON.stringify(mocks, null, 2), "utf-8");

    // Update local state so charts reflect change
    this.endpoints = this.endpoints.map((ep) =>
      ep.url === endpointUrl ? { ...ep, mock: mocks[endpointUrl] } : ep,
    );
    this.panel.webview.postMessage({
      type: "updateEndpoints",
      endpoints: this.endpoints,
    });
    vscode.window.showInformationMessage("Mock saved to .mockgen/mock.json");
  }

  private async openEditorForMock(endpointUrl: string, currentMock: any) {
    const mocksPath = path.join(this.workspaceRoot, ".mockgen", "mock.json");
    const dir = path.dirname(mocksPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Ensure file exists
    if (!fs.existsSync(mocksPath)) {
      const initial: Record<string, any> = {};
      if (currentMock) {
        initial[endpointUrl] = currentMock;
      }
      fs.writeFileSync(mocksPath, JSON.stringify(initial, null, 2), "utf-8");
    }

    try {
      const doc = await vscode.workspace.openTextDocument(mocksPath);
      const editor = await vscode.window.showTextDocument(doc);

      // Try to find the key for the endpoint and reveal it
      const text = doc.getText();
      const keyIndex = text.indexOf(JSON.stringify(endpointUrl));
      if (keyIndex >= 0) {
        const before = text.slice(0, keyIndex);
        const line = before.split(/\r\n|\r|\n/).length - 1;
        const pos = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos));
      }

      // Start watching the mock file for changes so the webview updates
      if (!this.mocksWatcher) {
        try {
          this.mocksWatcher = fs.watch(mocksPath, { persistent: false }, () => {
            this.reloadMocksIntoEndpoints(mocksPath);
          });
          this.disposables.push(
            new vscode.Disposable(() => this.mocksWatcher?.close()),
          );
        } catch {
          // ignore watcher errors
        }
      }

      vscode.window.showInformationMessage(
        `Edit mock for ${endpointUrl} and save the file to apply changes.`,
      );
    } catch (err) {
      vscode.window.showErrorMessage("Failed to open mock file for editing.");
    }
  }

  private reloadMocksIntoEndpoints(mocksPath: string) {
    try {
      const raw = fs.readFileSync(mocksPath, "utf-8");
      const mocks = JSON.parse(raw || "{}");

      this.endpoints = this.endpoints.map((ep) => ({
        ...ep,
        mock: mocks[ep.url] ?? ep.mock,
      }));

      this.panel.webview.postMessage({
        type: "updateEndpoints",
        endpoints: this.endpoints,
      });
    } catch {
      // ignore parse errors
    }
  }

  private getHtml(): string {
    const nonce = getNonce();
    const swaggerJsUri = `https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js`;
    const swaggerCssUri = `https://unpkg.com/swagger-ui-dist/swagger-ui.css`;
    const chartJsUri = `https://cdn.jsdelivr.net/npm/chart.js`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' https:; style-src 'nonce-${nonce}' https:;">
<link nonce="${nonce}" rel="stylesheet" href="${swaggerCssUri}" />
<title>MockGen Dashboard</title>
<style nonce="${nonce}">
  body { font-family:'Segoe UI',sans-serif; margin:0; padding:0; background:#f4f6f8; color:#333; }
  .tabs { display:flex; gap:8px; background:#1e1e1e; padding:8px; }
  .tabs button { padding:6px 14px; cursor:pointer; border:none; background:#333; color:white; border-radius:4px; transition:0.2s; }
  .tabs button.active { background:#007acc; }
  .tabs button:hover { background:#005a9e; }
  .controls { display:flex; gap:8px; margin:12px; flex-wrap:wrap; align-items:center; }
  .controls input, .controls select { padding:6px 10px; font-size:13px; border-radius:4px; border:1px solid #ccc; }
  #tab-endpoints, #tab-swagger, #tab-charts { padding:12px; display:none; }
  #tab-endpoints { display:block; }
  ul { list-style:none; padding:0; margin:0; max-height:400px; overflow:auto; }
  li { padding:8px; border-bottom:1px solid #ddd; display:flex; justify-content:space-between; align-items:center; background:white; margin-bottom:4px; border-radius:4px; }
  .method { padding:2px 6px; border-radius:4px; color:white; font-weight:bold; text-transform:uppercase; font-size:12px; margin-right:6px; }
  .GET { background:#28a745; }
  .POST { background:#007bff; }
  .PUT, .PATCH { background:#fd7e14; }
  .DELETE { background:#dc3545; }
  button.small { padding:4px 8px; font-size:11px; cursor:pointer; border:none; border-radius:4px; background:#007acc; color:white; margin-left:4px; transition:0.2s; }
  button.small:hover { background:#005a9e; }
  #empty { text-align:center; color:gray; margin-top:40px; }
  canvas { max-width:100%; background:white; border-radius:8px; padding:12px; }
  .stats { display:flex; gap:12px; margin-top:12px; flex-wrap:wrap; }
  .stat { background:white; padding:10px 12px; border-radius:6px; border:1px solid #e5e7eb; font-weight:600; color:#1e1e1e; }
</style>
</head>
<body>
<div class="tabs">
  <button id="btn-endpoints" class="active">Endpoints</button>
  <button id="btn-swagger">Swagger</button>
  <button id="btn-charts">Charts</button>
  <button id="btn-download-swagger">Download Swagger JSON</button>
  <button id="btn-download-mocks">Download Mock Bundle</button>
</div>

<div id="tab-endpoints">
  <div class="controls">
    <input id="search" placeholder="Search by URL or method"/>
    <select id="methodFilter">
      <option value="">All Methods</option>
      <option value="GET">GET</option>
      <option value="POST">POST</option>
      <option value="PUT">PUT</option>
      <option value="PATCH">PATCH</option>
      <option value="DELETE">DELETE</option>
    </select>
    <select id="sortSelect">
      <option value="url-asc">URL ↑</option>
      <option value="url-desc">URL ↓</option>
      <option value="method-asc">Method ↑</option>
      <option value="method-desc">Method ↓</option>
    </select>
  </div>
  <ul id="endpoints-list"></ul>
</div>

<div id="tab-swagger">
  <div id="swagger"></div>
</div>

<div id="tab-charts">
  <canvas id="methodChart"></canvas>
  <div class="stats" id="coverageStats"></div>
</div>

<script nonce="${nonce}" src="${swaggerJsUri}"></script>
<script nonce="${nonce}" src="${chartJsUri}"></script>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let endpoints = ${JSON.stringify(this.endpoints)};
let swaggerJson = ${JSON.stringify(this.swaggerJson)};
let methodChart;

function showTab(tab){
  document.getElementById('tab-endpoints').style.display = tab==='endpoints'?'block':'none';
  document.getElementById('tab-swagger').style.display = tab==='swagger'?'block':'none';
  document.getElementById('tab-charts').style.display = tab==='charts'?'block':'none';
  ['endpoints','swagger','charts'].forEach(t=>{
    document.getElementById('btn-'+t).classList.toggle('active', t===tab);
  });
  if(tab==='charts') renderCharts();
}

function renderEndpoints(){
  const query = document.getElementById('search').value.toLowerCase();
  const methodFilter = document.getElementById('methodFilter').value;
  const sortVal = document.getElementById('sortSelect').value;
  const list = document.getElementById('endpoints-list');
  list.innerHTML='';

  let filtered = endpoints.filter(ep => 
    (ep.url.toLowerCase().includes(query) || ep.method.toLowerCase().includes(query)) &&
    (methodFilter === '' || ep.method === methodFilter)
  );

  if(sortVal==='url-asc') filtered.sort((a,b)=>a.url.localeCompare(b.url));
  if(sortVal==='url-desc') filtered.sort((a,b)=>b.url.localeCompare(a.url));
  if(sortVal==='method-asc') filtered.sort((a,b)=>a.method.localeCompare(b.method));
  if(sortVal==='method-desc') filtered.sort((a,b)=>b.method.localeCompare(a.method));

  if(!filtered.length){ list.innerHTML='<li id="empty">No endpoints match your filters.</li>'; return; }

  filtered.forEach(ep=>{
    const li=document.createElement('li');
    const left=document.createElement('div');
    const methodSpan=document.createElement('span');
    methodSpan.className='method '+ep.method;
    methodSpan.textContent=ep.method;
    const urlSpan=document.createElement('span');
    urlSpan.textContent=ep.url;
    left.appendChild(methodSpan);
    left.appendChild(urlSpan);

    const right=document.createElement('div');
    const copyBtn=document.createElement('button');
    copyBtn.textContent='Copy';
    copyBtn.className='small';
    copyBtn.onclick=()=>copyEndpoint(ep.url);
    const editBtn=document.createElement('button');
    editBtn.textContent='Edit Mock';
    editBtn.className='small';
    editBtn.onclick=()=>editMock(ep);
    right.appendChild(copyBtn);
    right.appendChild(editBtn);

    li.appendChild(left);
    li.appendChild(right);
    list.appendChild(li);
  });
}

function editMock(ep){
  // Open the mock for this endpoint in the workspace editor
  vscode.postMessage({type:'openEditMock', endpoint:ep.url, mock:ep.mock||{}});
}

function copyEndpoint(url){
  vscode.postMessage({type:'copyEndpoint', url});
}

function renderSwagger(){
  SwaggerUIBundle({ dom_id:'#swagger', spec: swaggerJson, presets:[SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset] });
}

function downloadSwagger(){ vscode.postMessage({type:'downloadSwagger'}); }
function downloadMocks(){ vscode.postMessage({type:'downloadMocks'}); }

function renderCharts(){
  const methods=['GET','POST','PUT','PATCH','DELETE'];
  const methodCounts=methods.map(m=> endpoints.filter(e=>e.method===m).length);
  const total=endpoints.length;
  const mocked=endpoints.filter(e=>e.mock).length;
  const missing=total-mocked;

  if(methodChart) methodChart.destroy();
  methodChart=new Chart(document.getElementById('methodChart'), {
    type:'bar',
    data:{labels:methods,datasets:[{label:'Endpoints by Method',data:methodCounts,backgroundColor:['#28a745','#007bff','#fd7e14','#fd7e14','#dc3545']}]},
    options:{responsive:true, plugins:{legend:{display:false}}}
  });

  const coverage = document.getElementById('coverageStats');
  coverage.innerHTML = '';
  const stat = document.createElement('div');
  stat.className='stat';
  stat.textContent = \`Mocked: \${mocked} • Missing: \${missing} • Total: \${total}\`;
  coverage.appendChild(stat);
}

// Attach event listeners
document.getElementById('search').addEventListener('input', renderEndpoints);
document.getElementById('methodFilter').addEventListener('change', renderEndpoints);
document.getElementById('sortSelect').addEventListener('change', renderEndpoints);
document.getElementById('btn-endpoints').addEventListener('click',()=>showTab('endpoints'));
document.getElementById('btn-swagger').addEventListener('click',()=>showTab('swagger'));
document.getElementById('btn-charts').addEventListener('click',()=>showTab('charts'));
document.getElementById('btn-download-swagger').addEventListener('click', downloadSwagger);
document.getElementById('btn-download-mocks').addEventListener('click', downloadMocks);

// Initial render
renderEndpoints();
renderSwagger();
renderCharts();

// Listen to extension messages
window.addEventListener('message', event=>{
  const msg=event.data;
  if(msg.type==='updateEndpoints'){ endpoints=msg.endpoints; renderEndpoints(); renderCharts(); }
  if(msg.type==='updateSwagger'){ swaggerJson=msg.swaggerJson; renderSwagger(); }
});
</script>
</body>
</html>
`;
  }

  public dispose() {
    DashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

/* Helpers */
function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
