/**
 * Sidebar Webview Provider for the ADK Rust extension.
 *
 * Implements a rich sidebar with project cards, agent cards, and environment
 * status badges, replacing the native TreeDataProvider. Communicates with
 * the extension host via postMessage and integrates with the MessageBus
 * for bidirectional sync with the Studio webview.
 *
 * @module sidebarWebviewProvider
 */

import * as vscode from 'vscode';
import { getNonce } from './studioManager';
import { getLogger } from './logger';
import type { MessageBus, SidebarMessageTarget } from './messageBus';
import type {
  ProjectCardData,
  EnvironmentBadgeData,
  BusMessage,
  SidebarMessage,
  ExtensionToSidebarMessage,
} from './types';

/**
 * Provides the sidebar webview for the ADK Rust extension.
 *
 * Renders project cards, agent cards, and environment status in the
 * activity bar sidebar. Handles incoming messages from the webview
 * (card clicks, form submissions, ready signal) and exposes them
 * via an EventEmitter for the extension host to consume.
 *
 * @example
 * const provider = new SidebarWebviewProvider(context, messageBus);
 * const registration = vscode.window.registerWebviewViewProvider(
 *   SidebarWebviewProvider.viewType,
 *   provider,
 *   { webviewOptions: { retainContextWhenHidden: true } }
 * );
 */
export class SidebarWebviewProvider implements vscode.WebviewViewProvider, SidebarMessageTarget {
  /** The view type identifier registered in package.json. */
  public static readonly viewType = 'adkProjects';

  private webviewView: vscode.WebviewView | null = null;
  private projects: ProjectCardData[] = [];
  private environment: EnvironmentBadgeData | null = null;

  private readonly _onDidReceiveMessage = new vscode.EventEmitter<SidebarMessage>();

  /**
   * Fires when the sidebar webview posts a message to the extension host.
   *
   * Subscribe to this event to handle card clicks, form submissions,
   * and the initial `ready` signal from the webview.
   */
  public readonly onDidReceiveMessage: vscode.Event<SidebarMessage> = this._onDidReceiveMessage.event;

  /**
   * Creates a new SidebarWebviewProvider.
   *
   * @param context - The VS Code extension context for resource URIs
   * @param messageBus - The MessageBus instance for sidebar↔Studio sync
   */
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly messageBus: MessageBus,
  ) {}

  /**
   * Called by VS Code when the sidebar view becomes visible.
   *
   * Sets up the webview with script execution enabled, restricted
   * resource roots, and the HTML content with nonce-based CSP.
   * Listens for incoming messages from the webview and fires them
   * on the `onDidReceiveMessage` emitter. On receiving a `ready`
   * message, sends the current projects and environment data.
   *
   * @param webviewView - The webview view instance provided by VS Code
   * @param _context - Resolve context (unused)
   * @param _token - Cancellation token (unused)
   */
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message: SidebarMessage) => {
        this.handleMessage(message);
      },
      undefined,
      this.context.subscriptions,
    );

    webviewView.onDidDispose(() => {
      this.webviewView = null;
    });
  }

  /**
   * Updates the project cards displayed in the sidebar.
   *
   * Stores the projects locally and posts an `updateProjects` message
   * to the webview so it can re-render the card list.
   *
   * @param projects - The current list of project card data
   */
  updateProjects(projects: ProjectCardData[]): void {
    this.projects = projects;
    this.postMessage({ type: 'updateProjects', projects });
  }

  /**
   * Updates the environment status badge in the sidebar.
   *
   * Stores the environment data locally and posts an `updateEnvironment`
   * message to the webview so it can re-render the badge.
   *
   * @param environment - The current environment badge data
   */
  updateEnvironmentStatus(environment: EnvironmentBadgeData): void {
    this.environment = environment;
    this.postMessage({ type: 'updateEnvironment', environment });
  }

  /**
   * Sends a MessageBus message to the sidebar webview.
   *
   * Wraps the bus message in an `ExtensionToSidebarMessage` envelope
   * with type `busMessage` so the webview script can distinguish it
   * from direct extension messages.
   *
   * @param message - The bus message to forward to the webview
   */
  postMessageToWebview(message: BusMessage): void {
    this.postMessage({ type: 'busMessage', message });
  }

  /**
   * Sends a validation error message to the sidebar webview.
   *
   * Used by the message handlers to report form validation failures
   * (e.g. invalid project name) back to the webview UI.
   *
   * @param field - The form field that failed validation
   * @param message - The error message to display
   */
  sendValidationError(field: string, message: string): void {
    this.postMessage({ type: 'validationError', field, message });
  }


  /**
   * Generates the sidebar HTML with nonce-based Content Security Policy.
   *
   * Uses `--vscode-*` CSS variables for all styling so the sidebar
   * automatically matches the active VS Code theme. The script tag
   * acquires the VS Code API and sets up message handlers for
   * extension→webview communication.
   *
   * @param webview - The webview instance for CSP source resolution
   * @returns The complete HTML string for the sidebar
   */
  /**
     * Generates the sidebar HTML with nonce-based Content Security Policy.
     *
     * Uses `--vscode-*` CSS variables for all styling so the sidebar
     * automatically matches the active VS Code theme. The script tag
     * acquires the VS Code API and sets up message handlers for
     * extension→webview communication.
     *
     * @param webview - The webview instance for CSP source resolution
     * @returns The complete HTML string for the sidebar
     */
    private getHtmlContent(webview: vscode.Webview): string {
      const nonce = getNonce();
      const cspSource = webview.cspSource;

      return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>ADK Projects</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 8px;
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background-color: var(--vscode-sideBar-background);
        max-width: 300px;
        overflow-x: hidden;
      }

      /* Environment Badge */
      #environment-badge {
        margin-bottom: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        background-color: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-editorWidget-border);
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        font-size: 0.9em;
      }
      .badge-tool {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      .badge-tool .icon-ok { color: var(--vscode-testing-iconPassed, #73c991); }
      .badge-tool .icon-missing { color: var(--vscode-testing-iconFailed, #f14c4c); }
      .badge-keys {
        margin-left: auto;
        color: var(--vscode-descriptionForeground);
      }
      .badge-studio-warn {
        width: 100%;
        margin-top: 2px;
        font-size: 0.85em;
        color: var(--vscode-editorWarning-foreground, #cca700);
      }
      .badge-studio-warn a {
        color: var(--vscode-textLink-foreground);
        cursor: pointer;
        text-decoration: underline;
      }

      /* New Project Button */
      #new-project-btn {
        display: block;
        width: 100%;
        margin-bottom: 8px;
        padding: 6px 0;
        border: 1px solid var(--vscode-button-border, transparent);
        border-radius: 4px;
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        cursor: pointer;
        text-align: center;
      }
      #new-project-btn:hover {
        background-color: var(--vscode-button-hoverBackground);
      }

      /* Project List */
      #project-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .empty-state {
        text-align: center;
        padding: 16px 8px;
        color: var(--vscode-descriptionForeground);
      }

      /* Project Card */
      .project-card {
        border-radius: 4px;
        background-color: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-editorWidget-border);
        overflow: hidden;
      }
      .project-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
      }
      .project-name {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        min-width: 0;
      }
      .template-badge {
        font-size: 0.75em;
        padding: 1px 5px;
        border-radius: 3px;
        background-color: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        white-space: nowrap;
        flex-shrink: 0;
      }
      .status-indicator {
        flex-shrink: 0;
        font-size: 0.85em;
      }
      .status-stopped { color: var(--vscode-descriptionForeground); }
      .status-running { color: var(--vscode-testing-iconPassed, #73c991); }
      .status-building { color: var(--vscode-editorWarning-foreground, #cca700); }

      /* Action Buttons */
      .project-actions {
        display: flex;
        gap: 2px;
        padding: 0 6px 6px;
        flex-wrap: wrap;
      }
      .action-btn {
        flex: 1;
        min-width: 0;
        padding: 3px 4px;
        border: none;
        border-radius: 3px;
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        font-family: var(--vscode-font-family);
        font-size: 0.8em;
        cursor: pointer;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .action-btn:hover {
        background-color: var(--vscode-button-secondaryHoverBackground);
      }

      /* Agent Cards */
      .agent-list {
        border-top: 1px solid var(--vscode-editorWidget-border);
        padding: 4px 8px 6px;
      }
      .agent-card {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 3px 4px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 0.9em;
      }
      .agent-card:hover {
        background-color: var(--vscode-list-hoverBackground);
      }
      .agent-icon { flex-shrink: 0; }
      .agent-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        min-width: 0;
      }
      .agent-type {
        flex-shrink: 0;
        font-size: 0.8em;
        color: var(--vscode-descriptionForeground);
        text-transform: uppercase;
      }

      /* New Project Form */
      #new-project-form {
        display: none;
        margin-bottom: 8px;
        padding: 8px;
        border-radius: 4px;
        background-color: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-editorWidget-border);
      }
      #new-project-form.visible { display: block; }
      .form-label {
        display: block;
        margin-bottom: 3px;
        font-size: 0.9em;
        color: var(--vscode-descriptionForeground);
      }
      .form-input {
        width: 100%;
        padding: 4px 6px;
        margin-bottom: 6px;
        border: 1px solid var(--vscode-input-border);
        border-radius: 3px;
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        outline: none;
      }
      .form-input:focus {
        border-color: var(--vscode-focusBorder);
      }
      .form-input.invalid {
        border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
      }
      .form-error {
        display: none;
        margin: -4px 0 6px;
        font-size: 0.8em;
        color: var(--vscode-errorForeground);
      }
      .form-error.visible { display: block; }
      .template-option {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 4px 0;
      }
      .template-option input[type="radio"] {
        margin-top: 3px;
        accent-color: var(--vscode-focusBorder);
      }
      .template-option label {
        cursor: pointer;
      }
      .template-desc {
        font-size: 0.8em;
        color: var(--vscode-descriptionForeground);
      }
      .form-submit {
        display: block;
        width: 100%;
        margin-top: 6px;
        padding: 5px 0;
        border: 1px solid var(--vscode-button-border, transparent);
        border-radius: 4px;
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        cursor: pointer;
      }
      .form-submit:hover {
        background-color: var(--vscode-button-hoverBackground);
      }
      .form-submit:disabled {
        opacity: 0.5;
        cursor: default;
      }
    </style>
  </head>
  <body>
    <div id="environment-badge"></div>
    <button id="new-project-btn">+ New Project</button>
    <div id="new-project-form">
      <label class="form-label" for="project-name-input">Project Name</label>
      <input id="project-name-input" class="form-input" type="text"
        placeholder="my-agent" maxlength="64" autocomplete="off" spellcheck="false" />
      <div id="name-error" class="form-error" role="alert"></div>

      <label class="form-label">Template</label>
      <div id="template-list">
        <div class="template-option">
          <input type="radio" name="template" id="tpl-simple-chat" value="simple-chat" checked />
          <div>
            <label for="tpl-simple-chat">Simple Chat</label>
            <div class="template-desc">Basic conversational agent with a single LLM backend.</div>
          </div>
        </div>
        <div class="template-option">
          <input type="radio" name="template" id="tpl-tool-using-agent" value="tool-using-agent" />
          <div>
            <label for="tpl-tool-using-agent">Tool-Using Agent</label>
            <div class="template-desc">Agent that calls external tools and APIs to complete tasks.</div>
          </div>
        </div>
        <div class="template-option">
          <input type="radio" name="template" id="tpl-multi-agent" value="multi-agent-workflow" />
          <div>
            <label for="tpl-multi-agent">Multi-Agent Workflow</label>
            <div class="template-desc">Multiple agents collaborating in a sequential pipeline.</div>
          </div>
        </div>
        <div class="template-option">
          <input type="radio" name="template" id="tpl-graph" value="graph-workflow" />
          <div>
            <label for="tpl-graph">Graph Workflow</label>
            <div class="template-desc">LangGraph-style workflow with state management and branching.</div>
          </div>
        </div>
      </div>

      <button id="create-project-btn" class="form-submit" disabled>Create Project</button>
    </div>
    <div id="project-list">
      <div class="empty-state">Loading projects\u2026</div>
    </div>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

      const AGENT_ICONS = {
        llm: '\\uD83D\\uDCAC',
        sequential: '\\uD83D\\uDCCB',
        parallel: '\\u26A1',
        loop: '\\uD83D\\uDD04',
        graph: '\\uD83D\\uDD00'
      };

      const STATUS_MAP = {
        stopped: { icon: '\\u23F9', cls: 'status-stopped' },
        running: { icon: '\\u25B6', cls: 'status-running' },
        building: { icon: '\\u2699', cls: 'status-building' }
      };

      /* ---- Utility ---- */
      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
      }

      /* ---- New Project Form ---- */
      const newProjectBtn = document.getElementById('new-project-btn');
      const newProjectForm = document.getElementById('new-project-form');
      const nameInput = document.getElementById('project-name-input');
      const nameError = document.getElementById('name-error');
      const createBtn = document.getElementById('create-project-btn');

      newProjectBtn.addEventListener('click', function() {
        newProjectForm.classList.toggle('visible');
      });

      nameInput.addEventListener('input', function() {
        const val = nameInput.value;
        if (val.length === 0) {
          nameInput.classList.remove('invalid');
          nameError.classList.remove('visible');
          nameError.textContent = '';
          createBtn.disabled = true;
          return;
        }
        if (!NAME_REGEX.test(val)) {
          nameInput.classList.add('invalid');
          nameError.textContent = 'Must start with a letter, only a-z A-Z 0-9 _ - allowed (max 64).';
          nameError.classList.add('visible');
          createBtn.disabled = true;
        } else {
          nameInput.classList.remove('invalid');
          nameError.classList.remove('visible');
          nameError.textContent = '';
          createBtn.disabled = false;
        }
      });

      createBtn.addEventListener('click', function() {
        const name = nameInput.value;
        if (!NAME_REGEX.test(name)) return;
        const tpl = document.querySelector('input[name="template"]:checked');
        const template = tpl ? tpl.value : 'simple-chat';
        vscode.postMessage({ type: 'createProject', name: name, template: template });
        nameInput.value = '';
        createBtn.disabled = true;
        newProjectForm.classList.remove('visible');
      });

      /* ---- Notify extension that webview is ready ---- */
      vscode.postMessage({ type: 'ready' });

      /* ---- Message handlers from extension ---- */
      window.addEventListener('message', function(event) {
        var message = event.data;
        switch (message.type) {
          case 'updateProjects':
            renderProjects(message.projects);
            break;
          case 'updateEnvironment':
            renderEnvironment(message.environment);
            break;
          case 'projectStatusChanged':
            updateProjectStatus(message.projectId, message.status);
            break;
          case 'validationError':
            showValidationError(message.field, message.message);
            break;
          case 'busMessage':
            handleBusMessage(message.message);
            break;
        }
      });

      /* ---- Render Projects ---- */
      function renderProjects(projects) {
        var container = document.getElementById('project-list');
        if (!projects || projects.length === 0) {
          container.innerHTML = '<div class="empty-state">No ADK projects detected.</div>';
          return;
        }
        container.innerHTML = '';
        projects.forEach(function(p) {
          var card = document.createElement('div');
          card.className = 'project-card';
          card.setAttribute('data-project-id', p.id);

          var statusInfo = STATUS_MAP[p.status] || STATUS_MAP.stopped;

          /* Header: name + template badge + status */
          var header = document.createElement('div');
          header.className = 'project-header';

          var nameEl = document.createElement('span');
          nameEl.className = 'project-name';
          nameEl.textContent = p.name;
          header.appendChild(nameEl);

          if (p.templateType) {
            var badge = document.createElement('span');
            badge.className = 'template-badge';
            badge.textContent = p.templateType;
            header.appendChild(badge);
          }

          var statusEl = document.createElement('span');
          statusEl.className = 'status-indicator ' + statusInfo.cls;
          statusEl.setAttribute('data-status', p.status);
          statusEl.textContent = statusInfo.icon;
          statusEl.title = p.status;
          header.appendChild(statusEl);

          card.appendChild(header);

          /* Action buttons */
          var actions = document.createElement('div');
          actions.className = 'project-actions';

          actions.appendChild(makeActionBtn('Run', 'runProject', p.id));
          actions.appendChild(makeActionBtn('Build', 'buildProject', p.id));
          if (p.studioAvailable) {
            actions.appendChild(makeActionBtn('Studio', 'openInStudio', p.id));
          }
          actions.appendChild(makeActionBtn('Source', 'openSource', p.id));

          card.appendChild(actions);

          /* Agent cards */
          if (p.agents && p.agents.length > 0) {
            var agentList = document.createElement('div');
            agentList.className = 'agent-list';
            p.agents.forEach(function(a) {
              var agentCard = document.createElement('div');
              agentCard.className = 'agent-card';
              agentCard.title = a.type + ' agent: ' + a.name;
              agentCard.addEventListener('click', function() {
                vscode.postMessage({ type: 'openAgent', filePath: a.filePath, line: a.line });
              });

              var iconEl = document.createElement('span');
              iconEl.className = 'agent-icon';
              iconEl.textContent = AGENT_ICONS[a.type] || AGENT_ICONS.llm;
              agentCard.appendChild(iconEl);

              var agentName = document.createElement('span');
              agentName.className = 'agent-name';
              agentName.textContent = a.name;
              agentCard.appendChild(agentName);

              var typeLabel = document.createElement('span');
              typeLabel.className = 'agent-type';
              typeLabel.textContent = a.type;
              agentCard.appendChild(typeLabel);

              agentList.appendChild(agentCard);
            });
            card.appendChild(agentList);
          }

          container.appendChild(card);
        });
      }

      function makeActionBtn(label, msgType, projectId) {
        var btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.textContent = label;
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          vscode.postMessage({ type: msgType, projectId: projectId });
        });
        return btn;
      }

      /* ---- Render Environment Badge ---- */
      function renderEnvironment(env) {
        var badge = document.getElementById('environment-badge');
        if (!env) return;
        badge.innerHTML = '';

        env.tools.forEach(function(t) {
          var el = document.createElement('span');
          el.className = 'badge-tool';
          var icon = document.createElement('span');
          icon.className = t.available ? 'icon-ok' : 'icon-missing';
          icon.textContent = t.available ? '\\u2714' : '\\u2718';
          el.appendChild(icon);
          var nameSpan = document.createElement('span');
          nameSpan.textContent = t.name;
          el.appendChild(nameSpan);
          badge.appendChild(el);
        });

        var keys = document.createElement('span');
        keys.className = 'badge-keys';
        keys.textContent = '\\uD83D\\uDD11 ' + env.apiKeys.configured + '/' + env.apiKeys.total;
        badge.appendChild(keys);

        if (!env.studioAvailable) {
          var warn = document.createElement('div');
          warn.className = 'badge-studio-warn';
          warn.textContent = '\\u26A0 ADK Studio not installed. ';
          var link = document.createElement('a');
          link.textContent = 'Install';
          link.addEventListener('click', function() {
            vscode.postMessage({ type: 'openInstallGuide' });
          });
          warn.appendChild(link);
          badge.appendChild(warn);
        }
      }

      /* ---- Update Project Status ---- */
      function updateProjectStatus(projectId, status) {
        var card = document.querySelector('.project-card[data-project-id="' + CSS.escape(projectId) + '"]');
        if (!card) return;
        var statusEl = card.querySelector('.status-indicator');
        if (!statusEl) return;
        var info = STATUS_MAP[status] || STATUS_MAP.stopped;
        statusEl.className = 'status-indicator ' + info.cls;
        statusEl.setAttribute('data-status', status);
        statusEl.textContent = info.icon;
        statusEl.title = status;
      }

      /* ---- Validation Error ---- */
      function showValidationError(field, message) {
        if (field === 'name') {
          nameInput.classList.add('invalid');
          nameError.textContent = message;
          nameError.classList.add('visible');
          newProjectForm.classList.add('visible');
        }
      }

      /* ---- Bus Message Handler ---- */
      function handleBusMessage(message) {
        if (!message) return;
        if (message.type === 'agentCreated' || message.type === 'fileSaved' || message.type === 'projectCreated') {
          vscode.postMessage({ type: 'refreshProjects' });
        }
      }

      /* ---- Theme Change Observer ---- */
      var themeObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
          if (m.type === 'attributes' && m.attributeName === 'class') {
            var body = document.body;
            var isDark = body.classList.contains('vscode-dark');
            var isLight = body.classList.contains('vscode-light');
            var isHC = body.classList.contains('vscode-high-contrast');
            var theme = isHC ? 'high-contrast' : isDark ? 'dark' : 'light';
            vscode.postMessage({ type: 'themeChanged', theme: theme });
          }
        });
      });
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    </script>
  </body>
  </html>`;
    }


  /**
   * Handles an incoming message from the sidebar webview.
   *
   * Fires the message on the `onDidReceiveMessage` emitter so the
   * extension host can react. When the message is `ready`, sends
   * the current projects and environment data to populate the UI.
   *
   * @param message - The sidebar message received from the webview
   */
  private handleMessage(message: SidebarMessage): void {
    const logger = getLogger();
    logger.debug(`SidebarWebviewProvider: received message "${message.type}"`);

    this._onDidReceiveMessage.fire(message);

    if (message.type === 'ready') {
      this.sendCurrentState();
    }
  }

  /**
   * Sends the current projects and environment data to the webview.
   *
   * Called when the webview signals `ready` so it can render the
   * initial state immediately.
   */
  private sendCurrentState(): void {
    if (this.projects.length > 0) {
      this.postMessage({ type: 'updateProjects', projects: this.projects });
    }
    if (this.environment) {
      this.postMessage({ type: 'updateEnvironment', environment: this.environment });
    }
  }

  /**
   * Posts a message to the sidebar webview.
   *
   * Silently returns if the webview is not currently visible.
   *
   * @param message - The extension-to-sidebar message to send
   */
  private postMessage(message: ExtensionToSidebarMessage): void {
    if (!this.webviewView) {
      return;
    }
    this.webviewView.webview.postMessage(message);
  }
}
