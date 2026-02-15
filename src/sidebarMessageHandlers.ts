/**
 * Sidebar message handlers for the ADK Rust extension.
 *
 * Subscribes to messages from the sidebar webview and dispatches them
 * to the appropriate extension commands, scaffolder, or MessageBus.
 * Keeps handler logic separate from the webview provider.
 *
 * @module sidebarMessageHandlers
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getLogger } from './logger';
import { sanitizeProjectName, createProject } from './projectScaffolder';
import { toProjectCardData } from './dataConverters';
import type { SidebarWebviewProvider } from './sidebarWebviewProvider';
import type { MessageBus } from './messageBus';
import type { ProjectTreeProvider } from './projectTreeProvider';
import type { ConfigurationManager, TemplateType } from './configManager';
import type { SidebarMessage } from './types';

/**
 * Registers message handlers for the sidebar webview.
 *
 * Subscribes to {@link SidebarWebviewProvider.onDidReceiveMessage} and
 * handles each message type by delegating to the appropriate extension
 * command, scaffolder function, or MessageBus method.
 *
 * @param sidebar - The sidebar webview provider to listen on
 * @param messageBus - The MessageBus for sidebar↔Studio sync
 * @param projectTreeProvider - Provides detected ADK projects
 * @param configManager - Extension configuration manager
 * @param studioAvailable - Whether the `adk-studio` binary is available
 * @returns A disposable that unsubscribes the message listener
 */
export function registerSidebarMessageHandlers(
  sidebar: SidebarWebviewProvider,
  messageBus: MessageBus,
  projectTreeProvider: ProjectTreeProvider,
  configManager: ConfigurationManager,
  studioAvailable: boolean,
): vscode.Disposable {
  const logger = getLogger();

  return sidebar.onDidReceiveMessage(async (message: SidebarMessage) => {
    try {
      switch (message.type) {
        case 'runProject':
          await handleRunProject(message.projectId);
          break;
        case 'buildProject':
          await handleBuildProject(message.projectId);
          break;
        case 'openInStudio':
          handleOpenInStudio(message.projectId, messageBus);
          break;
        case 'openInstallGuide':
          handleOpenInstallGuide();
          break;
        case 'openSource':
          await handleOpenSource(message.projectId, projectTreeProvider);
          break;
        case 'openAgent':
          await handleOpenAgent(message.filePath, message.line);
          break;
        case 'createProject':
          await handleCreateProject(
            message.name,
            message.template,
            sidebar,
            projectTreeProvider,
            messageBus,
            studioAvailable,
          );
          break;
        case 'refreshProjects':
          await handleRefreshProjects(sidebar, projectTreeProvider, studioAvailable);
          break;
        default:
          break;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('Sidebar message handler error', err, {
        component: 'sidebarMessageHandlers',
        operation: message.type,
      });
      vscode.window.showErrorMessage(`Operation failed: ${errMsg}`);
    }
  });
}


/**
 * Handles the `runProject` message by executing the registered run command.
 *
 * @param projectId - The project identifier (absolute path)
 */
async function handleRunProject(projectId: string): Promise<void> {
  const logger = getLogger();
  logger.info(`Sidebar: running project ${projectId}`);
  await vscode.commands.executeCommand('adkRust.run');
}

/**
 * Handles the `buildProject` message by executing the registered build command.
 *
 * @param projectId - The project identifier (absolute path)
 */
async function handleBuildProject(projectId: string): Promise<void> {
  const logger = getLogger();
  logger.info(`Sidebar: building project ${projectId}`);
  await vscode.commands.executeCommand('adkRust.build');
}

/**
 * Handles the `openInStudio` message by sending a `focusProject` message
 * through the MessageBus to the Studio webview.
 *
 * @param projectId - The project identifier (absolute path)
 * @param messageBus - The MessageBus instance
 */
function handleOpenInStudio(projectId: string, messageBus: MessageBus): void {
  const logger = getLogger();
  logger.info(`Sidebar: opening project in Studio ${projectId}`);
  messageBus.send({
    type: 'focusProject',
    source: 'sidebar',
    payload: { projectId },
    id: '',
  });
}

/**
 * Handles the `openInstallGuide` message by opening the extension's
 * README.md file which contains installation instructions.
 */
function handleOpenInstallGuide(): void {
  const logger = getLogger();
  logger.info('Sidebar: opening extension README with install instructions');
  vscode.commands.executeCommand('extension.open', 'zavora-ai.adk-rust-extension').then(
    undefined,
    () => {
      // Fallback: open the README from the workspace if the command fails
      const readmePath = vscode.extensions.getExtension('zavora-ai.adk-rust-extension')?.extensionUri;
      if (readmePath) {
        const readmeUri = vscode.Uri.joinPath(readmePath, 'README.md');
        vscode.window.showTextDocument(readmeUri);
      }
    }
  );
}

/**
 * Handles the `openSource` message by opening the project's `src/main.rs`
 * in the editor.
 *
 * @param projectId - The project identifier (absolute path)
 * @param projectTreeProvider - Provides detected ADK projects
 */
async function handleOpenSource(
  projectId: string,
  projectTreeProvider: ProjectTreeProvider,
): Promise<void> {
  const project = projectTreeProvider.getProjects().find((p) => p.path === projectId);
  if (!project) {
    vscode.window.showWarningMessage('Project not found.');
    return;
  }

  const mainRsPath = path.join(project.path, 'src', 'main.rs');
  const uri = vscode.Uri.file(mainRsPath);
  await vscode.window.showTextDocument(uri);
}

/**
 * Handles the `openAgent` message by opening the source file at the
 * specified line in the editor.
 *
 * @param filePath - Absolute path to the source file
 * @param line - Line number where the agent is defined (1-based)
 */
async function handleOpenAgent(filePath: string, line: number): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const zeroBasedLine = Math.max(0, line - 1);
  const position = new vscode.Position(zeroBasedLine, 0);
  const selection = new vscode.Range(position, position);
  await vscode.window.showTextDocument(uri, { selection });
}

/**
 * Handles the `createProject` message by validating the name, scaffolding
 * the project, and updating the sidebar.
 *
 * @param name - The project name from the form
 * @param template - The selected template identifier
 * @param sidebar - The sidebar provider to post results back to
 * @param projectTreeProvider - Provides detected ADK projects
 * @param messageBus - The MessageBus for notifying Studio
 * @param studioAvailable - Whether the `adk-studio` binary is available
 */
async function handleCreateProject(
  name: string,
  template: string,
  sidebar: SidebarWebviewProvider,
  projectTreeProvider: ProjectTreeProvider,
  messageBus: MessageBus,
  studioAvailable: boolean,
): Promise<void> {
  const logger = getLogger();

  // Validate project name
  let sanitizedName: string;
  try {
    sanitizedName = sanitizeProjectName(name);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Invalid project name';
    sidebar.sendValidationError('name', errMsg);
    return;
  }

  // Get workspace folder
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Open a workspace folder first.');
    return;
  }

  try {
    await createProject({
      name: sanitizedName,
      template: template as TemplateType,
      targetDir: workspaceFolder.uri.fsPath,
      adkVersion: '0.1',
    });

    logger.info(`Sidebar: created project "${sanitizedName}" with template "${template}"`);

    // Refresh projects and update sidebar
    await handleRefreshProjects(sidebar, projectTreeProvider, studioAvailable);

    // Notify Studio via MessageBus
    const projects = projectTreeProvider.getProjects();
    const newProject = projects.find((p) => p.name === sanitizedName);
    if (newProject) {
      messageBus.send({
        type: 'projectCreated',
        source: 'sidebar',
        payload: { project: newProject },
        id: '',
      });
    }

    vscode.window.showInformationMessage(`Project "${sanitizedName}" created.`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Failed to create project';
    logger.error('Sidebar: project creation failed', err, {
      component: 'sidebarMessageHandlers',
      operation: 'createProject',
      data: { name: sanitizedName, template },
    });
    sidebar.sendValidationError('name', errMsg);
  }
}

/**
 * Handles the `refreshProjects` message by re-detecting projects and
 * updating the sidebar with fresh card data.
 *
 * @param sidebar - The sidebar provider to update
 * @param projectTreeProvider - Provides detected ADK projects
 * @param studioAvailable - Whether the `adk-studio` binary is available
 */
async function handleRefreshProjects(
  sidebar: SidebarWebviewProvider,
  projectTreeProvider: ProjectTreeProvider,
  studioAvailable: boolean,
): Promise<void> {
  const projects = await projectTreeProvider.detectProjects();
  const cardData = toProjectCardData(projects, studioAvailable);
  sidebar.updateProjects(cardData);
}
