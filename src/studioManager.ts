/**
 * Studio Manager for ADK Rust extension.
 *
 * Manages the ADK Studio server lifecycle and webview integration.
 *
 * @module studioManager
 */

import * as vscode from 'vscode';
import { spawn, execFileSync, ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuration for the ADK Studio server.
 */
export interface StudioConfig {
  /** Port number for the server */
  port: number;
  /** Custom path to the adk-studio binary, or null to use PATH */
  binaryPath: string | null;
  /** Whether to auto-start the server on extension activation */
  autoStart: boolean;
}

/**
 * Status of the ADK Studio server.
 */
export interface ServerStatus {
  /** Whether the server is currently running */
  running: boolean;
  /** Port the server is running on */
  port: number;
  /** Process ID of the server, or null if not running */
  pid: number | null;
  /** URL to access the server, or null if not running */
  url: string | null;
}

/**
 * Messages sent from the webview to the extension.
 */
export interface WebviewMessage {
  /** Type of message */
  type: 'generateCode' | 'runAgent' | 'saveProject' | 'error' | 'ready' | 'stopAgent' | 'openFile';
  /** Message payload */
  payload: unknown;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: StudioConfig = {
  port: 3000,
  binaryPath: null,
  autoStart: false,
};

/**
 * Timeout for server readiness check (ms).
 */
const SERVER_READY_TIMEOUT = 30000;

/**
 * Interval between server readiness checks (ms).
 */
const SERVER_READY_POLL_INTERVAL = 500;

/**
 * Maximum retry attempts for server connection.
 */
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Resolves a path to its canonical location, even when the leaf does not exist.
 *
 * SECURITY: This prevents symlink-based path escape by canonicalizing the nearest
 * existing ancestor and reconstructing the full candidate path.
 */
function resolveCanonicalPath(inputPath: string): string {
  const absolute = path.resolve(inputPath);

  // Walk up until we find an existing path segment we can realpath.
  let existing = absolute;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) {
      throw new Error(`Cannot resolve path: ${inputPath}`);
    }
    existing = parent;
  }

  const canonicalExisting = fs.realpathSync.native(existing);
  const remainder = path.relative(existing, absolute);
  return path.resolve(canonicalExisting, remainder);
}

/**
 * Checks whether a target path is within a workspace root, including symlink safety.
 *
 * SECURITY: Uses canonical paths and path-separator boundary checks to block
 * prefix and symlink escape attacks.
 */
export function isPathWithinWorkspace(targetPath: string, workspaceRoot: string): boolean {
  try {
    const canonicalRoot = fs.realpathSync.native(path.resolve(workspaceRoot));
    const canonicalTarget = resolveCanonicalPath(targetPath);
    return (
      canonicalTarget === canonicalRoot ||
      canonicalTarget.startsWith(canonicalRoot + path.sep)
    );
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically secure nonce for CSP.
 *
 * @returns A 32-character hex string nonce
 */
export function getNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}
/**
 * VS Code CSS variables to synchronize with the Studio iframe.
 * These are read from the webview's computed styles and posted
 * to the iframe via postMessage on theme changes.
 */
export const THEME_VARIABLES: readonly string[] = [
  // Core surfaces
  '--vscode-editor-background',
  '--vscode-editor-foreground',
  '--vscode-sideBar-background',
  '--vscode-sideBar-foreground',
  '--vscode-panel-background',
  '--vscode-panel-border',
  // Interactive elements
  '--vscode-button-background',
  '--vscode-button-foreground',
  '--vscode-button-hoverBackground',
  '--vscode-button-secondaryBackground',
  '--vscode-button-secondaryForeground',
  '--vscode-input-background',
  '--vscode-input-foreground',
  '--vscode-input-border',
  '--vscode-input-placeholderForeground',
  '--vscode-dropdown-background',
  '--vscode-dropdown-foreground',
  '--vscode-dropdown-border',
  // Feedback
  '--vscode-focusBorder',
  '--vscode-errorForeground',
  '--vscode-progressBar-background',
  // Text
  '--vscode-foreground',
  '--vscode-descriptionForeground',
  '--vscode-textLink-foreground',
  '--vscode-textLink-activeForeground',
  '--vscode-textCodeBlock-background',
  // Borders & widgets
  '--vscode-editorWidget-background',
  '--vscode-editorWidget-border',
  '--vscode-widget-shadow',
  // List / tree
  '--vscode-list-hoverBackground',
  '--vscode-list-activeSelectionBackground',
  '--vscode-list-activeSelectionForeground',
];

/**
 * Manages the ADK Studio server lifecycle and VS Code webview integration.
 *
 * @example
 * const manager = new StudioManager(context, configManager);
 * await manager.startServer();
 * const panel = manager.createWebviewPanel();
 */
export class StudioManager implements vscode.Disposable {
  private serverProcess: ChildProcess | null = null;
  private webviewPanel: vscode.WebviewPanel | null = null;
  private dismissedInSession: boolean = false;
  private config: StudioConfig;
  private readonly context: vscode.ExtensionContext;
  private readonly outputChannel: vscode.OutputChannel;
  private serverStatus: ServerStatus;

  /**
   * Creates a new StudioManager instance.
   *
   * @param context - VS Code extension context
   * @param config - Optional studio configuration
   */
  constructor(context: vscode.ExtensionContext, config?: Partial<StudioConfig>) {
    this.context = context;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.outputChannel = vscode.window.createOutputChannel('ADK Studio');
    this.serverStatus = {
      running: false,
      port: this.config.port,
      pid: null,
      url: null,
    };
  }

  /**
   * Updates the studio configuration.
   *
   * @param config - Partial configuration to merge
   */
  updateConfig(config: Partial<StudioConfig>): void {
    this.config = { ...this.config, ...config };
    this.serverStatus.port = this.config.port;
  }

  /**
   * Checks whether the adk-studio binary is available on PATH or at the configured path.
   *
   * @returns `true` if the binary can be found and executed with `--version`
   */
  isBinaryInstalled(): boolean {
    const binary = this.config.binaryPath || 'adk-studio';
    try {
      execFileSync(binary, ['--version'], { stdio: 'ignore', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the current server status.
   *
   * @returns Current server status
   */
  getServerStatus(): ServerStatus {
    return { ...this.serverStatus };
  }

  /**
   * Starts the ADK Studio server.
   *
   * @returns Promise resolving to server status when ready
   * @throws Error if server fails to start
   */
  async startServer(): Promise<ServerStatus> {
    if (this.serverStatus.running) {
      this.log('Server already running');
      return this.getServerStatus();
    }

    const binary = this.config.binaryPath || 'adk-studio';
    const args = ['--port', this.config.port.toString()];

    this.log(`Starting ADK Studio server: ${binary} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      try {
        // SECURITY: shell: false prevents command injection
        this.serverProcess = spawn(binary, args, {
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        const pid = this.serverProcess.pid;
        if (!pid) {
          reject(new Error(`Failed to start ADK Studio server on port ${this.config.port}: Process did not start`));
          return;
        }

        this.serverProcess.stdout?.on('data', (data: Buffer) => {
          this.log(`[stdout] ${data.toString().trim()}`);
        });

        this.serverProcess.stderr?.on('data', (data: Buffer) => {
          this.log(`[stderr] ${data.toString().trim()}`);
        });

        this.serverProcess.on('error', (err: Error) => {
          this.log(`Server error: ${err.message}`);
          this.handleServerExit(-1);
          reject(new Error(`Failed to start ADK Studio server on port ${this.config.port}: ${err.message}`));
        });

        this.serverProcess.on('close', (code: number | null) => {
          this.log(`Server exited with code ${code}`);
          this.handleServerExit(code ?? -1);
        });

        // Wait for server to be ready
        this.waitForServerReady()
          .then(() => {
            this.serverStatus = {
              running: true,
              port: this.config.port,
              pid: pid,
              url: `http://localhost:${this.config.port}`,
            };
            this.log(`Server ready at ${this.serverStatus.url}`);
            resolve(this.getServerStatus());
          })
          .catch((err) => {
            this.stopServer();
            reject(err);
          });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reject(new Error(`Failed to start ADK Studio server on port ${this.config.port}: ${message}`));
      }
    });
  }

  /**
   * Stops the ADK Studio server gracefully.
   *
   * @returns Promise that resolves when server is stopped
   */
  async stopServer(): Promise<void> {
    if (!this.serverProcess) {
      this.log('No server process to stop');
      return;
    }

    this.log('Stopping ADK Studio server...');

    return new Promise((resolve) => {
      if (!this.serverProcess) {
        resolve();
        return;
      }

      const proc = this.serverProcess;

      // Set up listener for process exit
      const onExit = () => {
        this.serverProcess = null;
        this.serverStatus = {
          running: false,
          port: this.config.port,
          pid: null,
          url: null,
        };
        this.log('Server stopped');
        resolve();
      };

      proc.once('close', onExit);

      // Send SIGTERM for graceful shutdown
      proc.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (this.serverProcess) {
          this.log('Force killing server...');
          proc.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  /**
   * Checks if the server is ready by polling the health endpoint.
   *
   * @returns Promise resolving to true if server is ready
   */
  async isServerReady(): Promise<boolean> {
    const url = `http://localhost:${this.config.port}/health`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Waits for the server to become ready with retries.
   *
   * @returns Promise that resolves when server is ready
   * @throws Error if server doesn't become ready within timeout
   */
  private async waitForServerReady(): Promise<void> {
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < SERVER_READY_TIMEOUT) {
      if (await this.isServerReady()) {
        return;
      }

      attempts++;
      if (attempts >= MAX_RETRY_ATTEMPTS * 10) {
        // Check if process is still alive
        if (!this.serverProcess || this.serverProcess.exitCode !== null) {
          throw new Error(`ADK Studio server exited unexpectedly on port ${this.config.port}`);
        }
      }

      await this.sleep(SERVER_READY_POLL_INTERVAL);
    }

    throw new Error(`ADK Studio server failed to start within ${SERVER_READY_TIMEOUT / 1000}s on port ${this.config.port}`);
  }

  /**
   * Creates and returns a webview panel for the Studio UI.
   *
   * @returns The created webview panel
   */
  createWebviewPanel(): vscode.WebviewPanel {
    if (this.webviewPanel) {
      this.webviewPanel.reveal();
      return this.webviewPanel;
    }

    this.webviewPanel = vscode.window.createWebviewPanel(
      'adkStudio',
      'ADK Studio',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        // SECURITY: Restrict to extension resources and localhost
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'media'),
          vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        ],
      }
    );

    // Set webview content — only show README fallback when binary is not installed
    const serverUrl = this.serverStatus.url || `http://localhost:${this.config.port}`;
    const showReadme = !this.serverStatus.running && !this.isBinaryInstalled();
    const readmeHtml = showReadme ? readReadmeAsHtml(this.context.extensionUri) : null;
    this.webviewPanel.webview.html = this.getWebviewContent(serverUrl, readmeHtml ?? undefined);

    // Handle messages from webview
    this.webviewPanel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleWebviewMessage(message),
      undefined,
      this.context.subscriptions
    );

    // Handle panel disposal
    this.webviewPanel.onDidDispose(
      () => {
        this.webviewPanel = null;
        this.dismissedInSession = true;
        // Stop server when webview is closed
        this.stopServer();
      },
      undefined,
      this.context.subscriptions
    );

    return this.webviewPanel;
  }

  /**
   * Auto-opens the Studio webview as an editor tab beside the current editor.
   *
   * Unlike `createWebviewPanel()`, this opens with `ViewColumn.Beside` to avoid
   * replacing the user's current editor. If the user has already dismissed the
   * Studio panel in this session, returns `null` to respect their preference.
   * If a panel already exists, it is revealed and returned.
   *
   * @returns The webview panel, or `null` if dismissed in this session
   *
   * @example
   * const panel = await studioManager.autoOpenStudio();
   * if (panel) {
   *   messageBus.registerStudio(panel);
   * }
   */
  async autoOpenStudio(): Promise<vscode.WebviewPanel | null> {
    if (this.dismissedInSession) {
      this.log('Studio dismissed in this session, skipping auto-open');
      return null;
    }

    if (this.webviewPanel) {
      this.webviewPanel.reveal();
      return this.webviewPanel;
    }

    this.webviewPanel = vscode.window.createWebviewPanel(
      'adkStudio',
      'ADK Studio',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        // SECURITY: Restrict to extension resources and localhost
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'media'),
          vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        ],
      }
    );

    // Set webview content — only show README fallback when binary is not installed
    const serverUrl = this.serverStatus.url || `http://localhost:${this.config.port}`;
    const showReadme = !this.serverStatus.running && !this.isBinaryInstalled();
    const readmeHtml = showReadme ? readReadmeAsHtml(this.context.extensionUri) : null;
    this.webviewPanel.webview.html = this.getWebviewContent(serverUrl, readmeHtml ?? undefined);

    // Handle messages from webview
    this.webviewPanel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleWebviewMessage(message),
      undefined,
      this.context.subscriptions
    );

    // Handle panel disposal — mark dismissed but do NOT stop the server
    this.webviewPanel.onDidDispose(
      () => {
        this.webviewPanel = null;
        this.dismissedInSession = true;
      },
      undefined,
      this.context.subscriptions
    );

    return this.webviewPanel;
  }

  /**
   * Returns whether the user has dismissed the Studio panel in this session.
   *
   * @returns `true` if the Studio panel was closed by the user during this session
   */
  isDismissedInSession(): boolean {
    return this.dismissedInSession;
  }

  /**
   * Marks the Studio panel as dismissed for the current session.
   *
   * After calling this, `autoOpenStudio()` will return `null` until the
   * session is reset (extension reactivation).
   */
  markDismissed(): void {
    this.dismissedInSession = true;
  }

  /**
   * Generates the HTML content for the webview with proper CSP.
   *
   * @param serverUrl - URL of the ADK Studio server
   * @returns HTML string for the webview
   */
  getWebviewContent(serverUrl: string, readmeHtml?: string): string {
      const nonce = getNonce();
      const serverRunning = this.serverStatus.running;

      // When the server isn't running and we have README content, show that instead
      if (!serverRunning && readmeHtml) {
        return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
      default-src 'none';
      style-src 'unsafe-inline';
      script-src 'nonce-${nonce}';
    ">
    <title>ADK Studio — Setup</title>
    <style>
      :root { color-scheme: light dark; }
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow-y: auto;
        font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
        font-size: var(--vscode-font-size, 13px);
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
      }
      .readme-container {
        max-width: 780px;
        margin: 0 auto;
        padding: 24px 32px;
        line-height: 1.6;
      }
      h1, h2, h3 { color: var(--vscode-foreground); margin-top: 1.5em; }
      h1 { font-size: 1.8em; border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border)); padding-bottom: 8px; }
      h2 { font-size: 1.4em; border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border)); padding-bottom: 6px; }
      h3 { font-size: 1.15em; }
      code {
        font-family: var(--vscode-editor-fontFamily, 'Menlo', monospace);
        font-size: 0.9em;
        background-color: var(--vscode-textCodeBlock-background);
        color: var(--vscode-foreground);
        padding: 2px 5px;
        border-radius: 3px;
      }
      pre {
        background-color: var(--vscode-textCodeBlock-background);
        padding: 12px 16px;
        border-radius: 4px;
        overflow-x: auto;
      }
      pre code { background: none; padding: 0; }
      a { color: var(--vscode-textLink-foreground); }
      a:hover { color: var(--vscode-textLink-activeForeground); }
      table { border-collapse: collapse; width: 100%; margin: 12px 0; }
      th, td {
        border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
        padding: 6px 10px;
        text-align: left;
      }
      th { background-color: var(--vscode-editorWidget-background); color: var(--vscode-foreground); }
      blockquote {
        border-left: 3px solid var(--vscode-textBlockQuote-border);
        margin: 12px 0;
        padding: 4px 16px;
        color: var(--vscode-descriptionForeground);
        background-color: var(--vscode-textBlockQuote-background);
      }
      ul, ol { padding-left: 24px; }
      li { margin: 4px 0; }
      img { max-width: 100%; border-radius: 4px; }
      hr { border: none; border-top: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border)); margin: 24px 0; }
      .banner {
        background-color: var(--vscode-inputValidation-infoBackground, var(--vscode-editorWidget-background));
        border: 1px solid var(--vscode-inputValidation-infoBorder, var(--vscode-focusBorder));
        border-radius: 6px;
        padding: 16px 20px;
        margin-bottom: 24px;
        text-align: center;
        color: var(--vscode-foreground);
      }
      .banner p { margin: 4px 0; }
      .banner code { font-size: 1em; }
    </style>
  </head>
  <body>
    <div class="readme-container">
      <div class="banner">
        <p><strong>ADK Studio is not running.</strong></p>
        <p>Install it with: <code>cargo install adk-studio</code></p>
        <p>Then reload this window or run <strong>ADK Rust: Open Studio</strong>.</p>
      </div>
      ${readmeHtml}
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      vscode.postMessage({ type: 'ready' });
    </script>
  </body>
  </html>`;
      }

      // SECURITY: Content Security Policy restricts what can be loaded
      return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
      default-src 'none';
      style-src 'unsafe-inline';
      script-src 'nonce-${nonce}';
      connect-src ${serverUrl};
      frame-src ${serverUrl};
    ">
    <title>ADK Studio</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
      .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: var(--vscode-foreground, #333);
      }
      .loading.hidden {
        display: none;
      }
      .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--vscode-progressBar-background, #0078d4);
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .error {
        color: var(--vscode-errorForeground, #f44336);
        text-align: center;
        padding: 20px;
      }
      .error button {
        margin-top: 10px;
        padding: 8px 16px;
        background: var(--vscode-button-background, #0078d4);
        color: var(--vscode-button-foreground, #fff);
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <div id="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading ADK Studio...</p>
    </div>
    <div id="error" class="error" style="display: none;">
      <p>Failed to connect to ADK Studio server.</p>
      <button onclick="retryConnection()">Retry</button>
    </div>
    <iframe id="studio-frame" style="display: none;"></iframe>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const iframe = document.getElementById('studio-frame');
      const loading = document.getElementById('loading');
      const error = document.getElementById('error');
      const BASE_URL = '${serverUrl}';

      // --- Theme detection ---

      /**
       * Derives the theme kind from the VS Code body class list.
       * VS Code sets one of: vscode-dark, vscode-light,
       * vscode-high-contrast, vscode-high-contrast-light.
       */
      function detectThemeKind() {
        const cl = document.body.classList;
        if (cl.contains('vscode-high-contrast')) return 'high-contrast-dark';
        if (cl.contains('vscode-high-contrast-light')) return 'high-contrast-light';
        if (cl.contains('vscode-dark')) return 'dark';
        return 'light';
      }

      const THEME_VARIABLES = ${JSON.stringify([...THEME_VARIABLES])};

      function getThemeVariables() {
        const styles = getComputedStyle(document.documentElement);
        const variables = {};
        THEME_VARIABLES.forEach(function(name) {
          variables[name] = styles.getPropertyValue(name).trim();
        });
        return variables;
      }

      /** Build the studio URL with a theme query parameter. */
      function buildStudioUrl(themeKind) {
        var sep = BASE_URL.indexOf('?') === -1 ? '?' : '&';
        return BASE_URL + sep + 'theme=' + encodeURIComponent(themeKind);
      }

      /** Post the full theme payload to the iframe. */
      function sendThemeToIframe() {
        if (iframe && iframe.contentWindow) {
          try {
            iframe.contentWindow.postMessage({
              type: 'themeChanged',
              themeKind: detectThemeKind(),
              variables: getThemeVariables()
            }, '*');
          } catch (e) {
            // iframe may not be loaded yet — ignore silently
          }
        }
      }

      // --- Lifecycle ---

      // Set initial iframe src with theme param
      var currentTheme = detectThemeKind();
      iframe.src = buildStudioUrl(currentTheme);

      // Notify extension that webview is ready
      vscode.postMessage({ type: 'ready' });

      iframe.onload = function() {
        loading.style.display = 'none';
        error.style.display = 'none';
        iframe.style.display = 'block';
        sendThemeToIframe();
      };

      iframe.onerror = function() {
        loading.style.display = 'none';
        error.style.display = 'block';
      };

      function retryConnection() {
        loading.style.display = 'flex';
        error.style.display = 'none';
        iframe.src = buildStudioUrl(detectThemeKind());
      }

      // Handle messages from the iframe
      window.addEventListener('message', function(event) {
        // Only accept messages from the studio server
        if (event.origin !== '${serverUrl.replace(/\/$/, '')}') {
          return;
        }

        // Forward to extension
        vscode.postMessage(event.data);
      });

      // Watch for VS Code theme changes (body class mutation)
      var themeObserver = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].type === 'attributes' && mutations[i].attributeName === 'class') {
            var newTheme = detectThemeKind();
            if (newTheme !== currentTheme) {
              currentTheme = newTheme;
              // Reload iframe with updated theme param so the studio
              // app can read it from the URL on initial render.
              iframe.src = buildStudioUrl(currentTheme);
            } else {
              // Same kind but variables may have changed (e.g. custom theme)
              sendThemeToIframe();
            }
            break;
          }
        }
      });
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    </script>
  </body>
  </html>`;
    }

  /**
   * Handles messages received from the webview.
   *
   * @param message - Message from the webview
   */
  handleWebviewMessage(message: WebviewMessage): void {
    this.log(`Received webview message: ${message.type}`);

    switch (message.type) {
      case 'ready':
        this.log('Webview ready');
        break;

      case 'generateCode':
        this.handleGenerateCode(message.payload as { projectId: string; targetPath: string });
        break;

      case 'runAgent':
        this.handleRunAgent(message.payload as { projectId: string });
        break;

      case 'stopAgent':
        this.handleStopAgent();
        break;

      case 'openFile':
        this.handleOpenFile(message.payload as { path: string });
        break;

      case 'saveProject':
        void this.handleSaveProject(message.payload as { path: string; content: string }).catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          this.log(`Failed to save project file: ${message}`);
          vscode.window.showErrorMessage(`Failed to save file: ${message}`);
        });
        break;

      case 'error':
        this.log(`Webview error: ${JSON.stringify(message.payload)}`);
        break;

      default:
        this.log(`Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handles code generation request from webview.
   */
  private handleGenerateCode(payload: { projectId: string; targetPath: string }): void {
    this.log(`Generate code for project ${payload.projectId} to ${payload.targetPath}`);
    // Implementation would integrate with project scaffolder
    vscode.window.showInformationMessage(`Generating code for project: ${payload.projectId}`);
  }

  /**
   * Handles run agent request from webview.
   */
  private handleRunAgent(payload: { projectId: string }): void {
    this.log(`Run agent for project ${payload.projectId}`);
    // Implementation would integrate with build runner
    vscode.window.showInformationMessage(`Running agent: ${payload.projectId}`);
  }

  /**
   * Handles stop agent request from webview.
   */
  private handleStopAgent(): void {
    this.log('Stop agent requested');
    // Implementation would integrate with build runner
    vscode.window.showInformationMessage('Stopping agent...');
  }

  /**
   * Handles open file request from webview.
   */
  private handleOpenFile(payload: { path: string }): void {
    this.log(`Open file: ${payload.path}`);

    // SECURITY: Validate path is within workspace
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, payload.path);
    const workspaceRoot = workspaceFolder.uri.fsPath;

    if (!isPathWithinWorkspace(fileUri.fsPath, workspaceRoot)) {
      vscode.window.showErrorMessage('Cannot open file outside workspace');
      return;
    }

    vscode.window.showTextDocument(fileUri);
  }

  /**
   * Handles save project request from webview.
   *
   * Writes file content to a workspace-relative path after validating
   * the path is relative and within the workspace boundary.
   *
   * @param payload - The save payload with relative path and file content
   */
  private async handleSaveProject(payload: { path: string; content: string }): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    // SECURITY: Reject absolute paths — payload must be relative
    if (path.isAbsolute(payload.path)) {
      vscode.window.showErrorMessage('Invalid save path: must be relative to workspace');
      return;
    }

    const absolutePath = path.resolve(workspaceFolder.uri.fsPath, payload.path);

    // SECURITY: Validate resolved path is within workspace
    if (!isPathWithinWorkspace(absolutePath, workspaceFolder.uri.fsPath)) {
      vscode.window.showErrorMessage('Cannot save file outside workspace');
      return;
    }

    // Ensure parent directories exist before writing.
    const parentDirUri = vscode.Uri.file(path.dirname(absolutePath));
    await vscode.workspace.fs.createDirectory(parentDirUri);

    const fileUri = vscode.Uri.file(absolutePath);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(payload.content, 'utf-8'));
    this.log(`Saved project file: ${payload.path}`);
  }


  /**
   * Handles server process exit.
   */
  private handleServerExit(code: number): void {
    this.serverProcess = null;
    this.serverStatus = {
      running: false,
      port: this.config.port,
      pid: null,
      url: null,
    };

    if (code !== 0 && this.webviewPanel) {
      vscode.window
        .showErrorMessage('ADK Studio server crashed. Would you like to restart it?', 'Restart', 'View Logs')
        .then((selection) => {
          if (selection === 'Restart') {
            this.startServer().catch((err) => {
              vscode.window.showErrorMessage(`Failed to restart server: ${err.message}`);
            });
          } else if (selection === 'View Logs') {
            this.outputChannel.show();
          }
        });
    }
  }

  /**
   * Logs a message to the output channel.
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  /**
   * Sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Disposes of all resources.
   */
  dispose(): void {
    this.stopServer();
    this.webviewPanel?.dispose();
    this.outputChannel.dispose();
  }
}

/**
 * Reads the extension README.md and converts it to basic HTML.
 *
 * Uses a minimal markdown-to-HTML conversion (headings, code blocks,
 * inline code, links, bold, lists, tables, blockquotes, paragraphs).
 * No external dependencies required.
 *
 * @param extensionUri - The extension's root URI
 * @returns HTML string, or null if the README cannot be read
 */
function readReadmeAsHtml(extensionUri: vscode.Uri): string | null {
  try {
    const readmePath = vscode.Uri.joinPath(extensionUri, 'README.md').fsPath;
    const md = fs.readFileSync(readmePath, 'utf-8');
    return markdownToHtml(md);
  } catch {
    return null;
  }
}

/**
 * Minimal markdown-to-HTML converter. Handles the subset of markdown
 * used in the extension README without requiring a third-party library.
 *
 * @param md - Raw markdown string
 * @returns HTML string
 */
function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let inCodeBlock = false;
  let inTable = false;
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        html.push('</code></pre>');
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        html.push('<pre><code>');
      }
      continue;
    }
    if (inCodeBlock) {
      html.push(escapeHtmlChars(line));
      continue;
    }

    // Close list if current line is not a list item
    const isListItem = /^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line);
    if (inList && !isListItem && line.trim() !== '') {
      html.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
    }

    // Close table if current line is not a table row
    const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|');
    if (inTable && !isTableRow) {
      html.push('</table>');
      inTable = false;
    }

    // Empty line
    if (line.trim() === '') {
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Table rows
    if (isTableRow) {
      const cells = line.split('|').filter(c => c.trim() !== '');
      // Skip separator rows (|---|---|)
      if (cells.every(c => /^[\s-:]+$/.test(c))) {
        continue;
      }
      if (!inTable) {
        inTable = true;
        html.push('<table>');
        // First row is header
        html.push('<tr>' + cells.map(c => `<th>${inlineFormat(c.trim())}</th>`).join('') + '</tr>');
        continue;
      }
      html.push('<tr>' + cells.map(c => `<td>${inlineFormat(c.trim())}</td>`).join('') + '</tr>');
      continue;
    }

    // Blockquotes
    if (line.startsWith('>')) {
      html.push(`<blockquote><p>${inlineFormat(line.replace(/^>\s*/, ''))}</p></blockquote>`);
      continue;
    }

    // Unordered list items
    const ulMatch = line.match(/^\s*[-*]\s+(.*)/);
    if (ulMatch) {
      if (!inList) {
        inList = true;
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list items
    const olMatch = line.match(/^\s*\d+\.\s+(.*)/);
    if (olMatch) {
      if (!inList) {
        inList = true;
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    // Paragraph
    html.push(`<p>${inlineFormat(line)}</p>`);
  }

  // Close any open blocks
  if (inCodeBlock) { html.push('</code></pre>'); }
  if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); }
  if (inTable) { html.push('</table>'); }

  return html.join('\n');
}

/** Escapes HTML special characters. */
function escapeHtmlChars(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Applies inline markdown formatting (bold, code, links). */
function inlineFormat(text: string): string {
  let result = escapeHtmlChars(text);
  // Inline code (must come before bold to avoid conflicts)
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return result;
}
