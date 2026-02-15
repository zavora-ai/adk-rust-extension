/**
 * ADK Rust VS Code Extension Entry Point.
 *
 * Initializes all components and registers commands for the ADK-Rust
 * development environment.
 *
 * @module extension
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ConfigurationManager } from './configManager';
import {
  checkEnvironment,
  EnvironmentStatus,
  updateEnvKey,
} from './environmentChecker';
import {
  createProject,
  getTemplates,
  getTemplateMetadata,
  sanitizeProjectName,
} from './projectScaffolder';
import { StudioManager } from './studioManager';
import { build, run, cancel, isRunning, loadEnvFile, BuildConfig } from './buildRunner';
import { StatusManager } from './statusManager';
import { ProjectTreeProvider, AdkProject, AdkTreeItem } from './projectTreeProvider';
import { Logger, getLogger, disposeLogger, maskSensitiveData } from './logger';
import { MessageBus } from './messageBus';
import {
  registerSidebarWithFallback,
  attemptWebviewReload,
  SidebarRegistrationResult,
} from './sidebarFallback';
import { registerSidebarMessageHandlers } from './sidebarMessageHandlers';
import { toProjectCardData, toEnvironmentBadgeData } from './dataConverters';

/** Reusable diagnostic collection for build errors — cleared on each build. */
let buildDiagnosticCollection: vscode.DiagnosticCollection | null = null;

/** Reusable output channel for run output — avoids leaking channels. */
let runOutputChannel: vscode.OutputChannel | null = null;

/**
 * Activates the ADK Rust extension.
 *
 * @param context - VS Code extension context
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = getLogger();
  logger.info('ADK Rust extension activating...');

  // Initialize components
  const configManager = new ConfigurationManager();
  const settings = configManager.getSettings();

  // Set logger verbosity based on settings
  switch (settings.verbosity) {
    case 'quiet':
      logger.setLevel('error');
      break;
    case 'verbose':
      logger.setLevel('debug');
      break;
    default:
      logger.setLevel('info');
  }

  const statusManager = new StatusManager();
  const studioManager = new StudioManager(context, {
    port: settings.studioPort,
    binaryPath: settings.adkStudioPath,
    autoStart: settings.autoStartStudio,
  });

  const projectTreeProvider = new ProjectTreeProvider();

  // Create MessageBus for sidebar↔Studio synchronization
  const messageBus = new MessageBus();

  // Conditionally register sidebar webview or native tree view
  let sidebarResult: SidebarRegistrationResult;

  if (settings.sidebarWebview) {
    sidebarResult = registerSidebarWithFallback(context, messageBus, projectTreeProvider);
    if (sidebarResult.sidebarProvider) {
      messageBus.registerSidebar(sidebarResult.sidebarProvider);
    }
  } else {
    const treeView = vscode.window.createTreeView('adkProjects', {
      treeDataProvider: projectTreeProvider,
      showCollapseAll: true,
    });
    sidebarResult = { isWebview: false, disposable: treeView, sidebarProvider: null };
  }

  // Listen for settings changes
  const settingsDisposable = configManager.onSettingsChanged((newSettings) => {
    logger.debug('Settings changed');

    switch (newSettings.verbosity) {
      case 'quiet':
        logger.setLevel('error');
        break;
      case 'verbose':
        logger.setLevel('debug');
        break;
      default:
        logger.setLevel('info');
    }

    studioManager.updateConfig({
      port: newSettings.studioPort,
      binaryPath: newSettings.adkStudioPath,
      autoStart: newSettings.autoStartStudio,
    });
  });

  // Register commands
  const openStudioCmd = vscode.commands.registerCommand('adkRust.openStudio', async () => {
    await openStudio(studioManager, statusManager, logger);
  });

  const createProjectCmd = vscode.commands.registerCommand('adkRust.createProject', async () => {
    await createProjectCommand(configManager, logger, projectTreeProvider);
  });

  const buildCmd = vscode.commands.registerCommand('adkRust.build', async (treeItem?: AdkTreeItem) => {
    await buildCommand(configManager, statusManager, projectTreeProvider, logger, treeItem);
  });

  const runCmd = vscode.commands.registerCommand('adkRust.run', async (treeItem?: AdkTreeItem) => {
    await runCommand(configManager, statusManager, projectTreeProvider, logger, treeItem);
  });

  const checkEnvCmd = vscode.commands.registerCommand('adkRust.checkEnvironment', async () => {
    await checkEnvironmentCommand(configManager, statusManager, logger);
  });

  const viewLogsCmd = vscode.commands.registerCommand('adkRust.viewLogs', () => {
    logger.show();
  });

  const refreshProjectsCmd = vscode.commands.registerCommand('adkRust.refreshProjects', () => {
    if (sidebarResult && !sidebarResult.isWebview) {
      sidebarResult = attemptWebviewReload(context, messageBus, projectTreeProvider, sidebarResult);
      if (sidebarResult.isWebview && sidebarResult.sidebarProvider) {
        messageBus.registerSidebar(sidebarResult.sidebarProvider);
      }
    }
    projectTreeProvider.refresh();
  });

  const configureApiKeysCmd = vscode.commands.registerCommand(
    'adkRust.configureApiKeys',
    async () => {
      await configureApiKeysCommand(logger);
    }
  );

  const openSettingsCmd = vscode.commands.registerCommand('adkRust.openSettings', () => {
    vscode.commands.executeCommand('workbench.action.openSettings', 'adkRust');
  });

  // Add all disposables to context
  context.subscriptions.push(
    configManager,
    studioManager,
    statusManager,
    projectTreeProvider,
    messageBus,
    sidebarResult.disposable,
    settingsDisposable,
    openStudioCmd,
    createProjectCmd,
    buildCmd,
    runCmd,
    checkEnvCmd,
    viewLogsCmd,
    refreshProjectsCmd,
    configureApiKeysCmd,
    openSettingsCmd
  );

  // Set up sidebar message handlers if webview is active
  if (sidebarResult.sidebarProvider) {
    const env = await checkEnvironment({ adkStudioPath: settings.adkStudioPath });
    const handlersDisposable = registerSidebarMessageHandlers(
      sidebarResult.sidebarProvider,
      messageBus,
      projectTreeProvider,
      configManager,
      env.adkStudio.available,
    );
    context.subscriptions.push(handlersDisposable);

    // Initial data load for sidebar
    const projects = await projectTreeProvider.detectProjects();
    const cardData = toProjectCardData(projects, env.adkStudio.available);
    sidebarResult.sidebarProvider.updateProjects(cardData);
    const badgeData = toEnvironmentBadgeData(env);
    sidebarResult.sidebarProvider.updateEnvironmentStatus(badgeData);
  }

  // File watchers for Cargo.toml changes to trigger sidebar refresh
  const cargoWatcher = vscode.workspace.createFileSystemWatcher('**/Cargo.toml');
  const onCargoChange = async (): Promise<void> => {
    if (sidebarResult?.sidebarProvider) {
      const projects = await projectTreeProvider.detectProjects();
      const env = await checkEnvironment({ adkStudioPath: settings.adkStudioPath });
      const cardData = toProjectCardData(projects, env.adkStudio.available);
      sidebarResult.sidebarProvider.updateProjects(cardData);
    }
    projectTreeProvider.refresh();
  };
  cargoWatcher.onDidCreate(onCargoChange);
  cargoWatcher.onDidChange(onCargoChange);
  cargoWatcher.onDidDelete(onCargoChange);
  context.subscriptions.push(cargoWatcher);

  // Auto-open Studio if conditions are met
  if (settings.autoStartStudio && settings.studioAutoOpen) {
    try {
      const projects = projectTreeProvider.getProjects().length > 0
        ? projectTreeProvider.getProjects()
        : await projectTreeProvider.detectProjects();

      if (projects.length > 0 && !studioManager.isDismissedInSession()) {
        logger.info('Auto-opening ADK Studio...');
        statusManager.showServerStarting(settings.studioPort);

        try {
          await studioManager.startServer();
          statusManager.showServerStatus(studioManager.getServerStatus());
        } catch (serverErr) {
          const serverMsg = serverErr instanceof Error ? serverErr.message : String(serverErr);
          logger.warn(`ADK Studio server failed to start during auto-open: ${serverMsg}`);
          statusManager.showServerCrashed(serverMsg);
          // Continue — the panel has error/retry UI
        }

        const panel = await studioManager.autoOpenStudio();
        if (panel) {
          messageBus.registerStudio(panel);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Failed to auto-open ADK Studio', err, {
        component: 'extension',
        operation: 'autoOpenStudio',
      });
      statusManager.showServerCrashed(message);
    }
  }

  logger.info('ADK Rust extension activated');
}

/**
 * Deactivates the extension and cleans up resources.
 */
export async function deactivate(): Promise<void> {
  const logger = getLogger();
  logger.info('ADK Rust extension deactivating...');

  if (isRunning()) {
    cancel();
  }

  if (buildDiagnosticCollection) {
    buildDiagnosticCollection.dispose();
    buildDiagnosticCollection = null;
  }
  if (runOutputChannel) {
    runOutputChannel.dispose();
    runOutputChannel = null;
  }

  disposeLogger();
}

/**
 * Opens the ADK Studio in a webview panel.
 * Attempts to start the server first, but opens the panel regardless
 * so the user sees the loading/error UI.
 */
async function openStudio(
  studioManager: StudioManager,
  statusManager: StatusManager,
  logger: Logger
): Promise<void> {
  try {
    const status = studioManager.getServerStatus();

    if (!status.running) {
      logger.info('Starting ADK Studio server...');
      statusManager.showServerStarting(status.port);

      try {
        await studioManager.startServer();
        statusManager.showServerStatus(studioManager.getServerStatus());
      } catch (serverErr) {
        const serverMsg = serverErr instanceof Error ? serverErr.message : String(serverErr);
        logger.warn(`ADK Studio server failed to start: ${serverMsg}`);
        statusManager.showServerCrashed(serverMsg);
        // Continue to open the panel — it has its own error/retry UI
      }
    }

    studioManager.createWebviewPanel();
    logger.info('ADK Studio opened');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to open ADK Studio', err, {
      component: 'extension',
      operation: 'openStudio',
    });

    const action = await statusManager.showError(
      `Failed to open ADK Studio: ${message}`,
      'Install Instructions',
      'View Logs'
    );

    if (action === 'Install Instructions') {
      const ext = vscode.extensions.getExtension('zavora-ai.adk-rust-extension');
      if (ext) {
        const readmeUri = vscode.Uri.joinPath(ext.extensionUri, 'README.md');
        const doc = await vscode.workspace.openTextDocument(readmeUri);
        await vscode.window.showTextDocument(doc);
      }
    } else if (action === 'View Logs') {
      logger.show();
    }
  }
}

/**
 * Creates a new ADK project from a template.
 */
async function createProjectCommand(
  configManager: ConfigurationManager,
  logger: Logger,
  projectTreeProvider: ProjectTreeProvider
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Open a workspace folder first.');
    return;
  }

  const name = await vscode.window.showInputBox({
    title: 'Create ADK Project',
    prompt: 'Enter project name',
    value: 'my-adk-agent',
    validateInput: (value) => {
      try {
        sanitizeProjectName(value);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Invalid project name';
      }
    },
  });

  if (!name) {
    return;
  }

  const templates = getTemplates();
  const defaultTemplate = configManager.getSetting('defaultTemplate');

  const templateItems = templates.map((t) => {
    const meta = getTemplateMetadata(t);
    return {
      label: meta.name,
      description: t === defaultTemplate ? '(default)' : undefined,
      detail: meta.description,
      id: t,
    };
  });

  const selectedTemplate = await vscode.window.showQuickPick(templateItems, {
    title: 'Select Project Template',
    placeHolder: 'Choose a template for your ADK project',
  });

  if (!selectedTemplate) {
    return;
  }

  const projectPath = path.join(workspaceFolder.uri.fsPath, name);
  const projectUri = vscode.Uri.file(projectPath);

  try {
    await vscode.workspace.fs.stat(projectUri);
    const overwrite = await vscode.window.showWarningMessage(
      `Directory "${name}" already exists. Overwrite?`,
      { modal: true },
      'Overwrite'
    );
    if (overwrite !== 'Overwrite') {
      return;
    }
    await vscode.workspace.fs.delete(projectUri, { recursive: true });
  } catch {
    // Directory doesn't exist, which is fine
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Creating ADK project',
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: 'Generating project files...' });

        await createProject({
          name,
          template: selectedTemplate.id,
          targetDir: workspaceFolder.uri.fsPath,
          adkVersion: '0.1',
        });

        logger.info(`Created ADK project: ${name} (${selectedTemplate.id})`);

        progress.report({ message: 'Opening project...' });

        const mainRsUri = vscode.Uri.file(path.join(projectPath, 'src', 'main.rs'));
        await vscode.window.showTextDocument(mainRsUri);

        projectTreeProvider.refresh();

        const action = await vscode.window.showInformationMessage(
          `ADK project "${name}" created successfully!`,
          'Set Up .env',
          'Check Environment'
        );

        if (action === 'Set Up .env') {
          const envExamplePath = path.join(projectPath, '.env.example');
          const envPath = path.join(projectPath, '.env');

          try {
            await vscode.workspace.fs.stat(vscode.Uri.file(envExamplePath));
            try {
              await vscode.workspace.fs.stat(vscode.Uri.file(envPath));
              await vscode.window.showTextDocument(vscode.Uri.file(envPath));
            } catch {
              await vscode.workspace.fs.copy(
                vscode.Uri.file(envExamplePath),
                vscode.Uri.file(envPath),
                { overwrite: false }
              );
              await vscode.window.showTextDocument(vscode.Uri.file(envPath));
            }
          } catch {
            vscode.window.showErrorMessage(
              'No .env.example found in project. Create a .env file manually.'
            );
          }
        }

        if (action === 'Check Environment') {
          await vscode.commands.executeCommand('adkRust.checkEnvironment');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('Failed to create project', err, {
          component: 'extension',
          operation: 'createProject',
          data: { name, template: selectedTemplate.id },
        });
        vscode.window.showErrorMessage(`Failed to create project: ${message}`);
      }
    }
  );
}

/**
 * Builds the current ADK project.
 */
async function buildCommand(
  configManager: ConfigurationManager,
  statusManager: StatusManager,
  projectTreeProvider: ProjectTreeProvider,
  logger: Logger,
  treeItem?: AdkTreeItem
): Promise<void> {
  let project: AdkProject | null = null;

  if (treeItem?.project) {
    project = treeItem.project;
  } else {
    project = await selectProject(projectTreeProvider, 'build');
  }

  if (!project) {
    return;
  }

  const settings = configManager.getSettings();

  logger.info(`Building project: ${project.name}`);
  statusManager.showBuildProgress(`Building ${project.name}...`);

  try {
    const config: BuildConfig = {
      projectPath: project.path,
      command: 'build',
      args: [],
      env: {},
    };

    const result = await build(config, { cargoPath: settings.cargoPath ?? undefined });

    statusManager.hideBuildProgress();

    if (result.success) {
      logger.info(`Build succeeded: ${project.name}`);
      if (buildDiagnosticCollection) {
        buildDiagnosticCollection.clear();
      }
      await statusManager.showSuccess(`Build completed: ${project.name}`);
    } else {
      logger.warn(`Build failed: ${project.name}`);

      if (result.diagnostics.length > 0) {
        if (!buildDiagnosticCollection) {
          buildDiagnosticCollection = vscode.languages.createDiagnosticCollection('adk-rust');
        }
        buildDiagnosticCollection.clear();
        const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();

        for (const diag of result.diagnostics) {
          const filePath = path.isAbsolute(diag.file)
            ? diag.file
            : path.join(project.path, diag.file);
          const fileUri = vscode.Uri.file(filePath);
          const key = fileUri.toString();

          if (!diagnosticsByFile.has(key)) {
            diagnosticsByFile.set(key, []);
          }

          const severity =
            diag.severity === 'error'
              ? vscode.DiagnosticSeverity.Error
              : diag.severity === 'warning'
                ? vscode.DiagnosticSeverity.Warning
                : vscode.DiagnosticSeverity.Information;

          const range = new vscode.Range(
            Math.max(0, diag.line - 1),
            Math.max(0, diag.column - 1),
            Math.max(0, diag.line - 1),
            100
          );

          const vscDiag = new vscode.Diagnostic(range, diag.message, severity);
          if (diag.code) {
            vscDiag.code = diag.code;
          }
          vscDiag.source = 'cargo';

          diagnosticsByFile.get(key)!.push(vscDiag);
        }

        for (const [uriStr, diags] of diagnosticsByFile) {
          buildDiagnosticCollection.set(vscode.Uri.parse(uriStr), diags);
        }
      } else if (buildDiagnosticCollection) {
        buildDiagnosticCollection.clear();
      }

      const action = await statusManager.showError(
        `Build failed: ${project.name}`,
        'View Output',
        'View Logs'
      );

      if (action === 'View Output') {
        const doc = await vscode.workspace.openTextDocument({
          content: result.stderr || result.stdout,
          language: 'plaintext',
        });
        await vscode.window.showTextDocument(doc);
      } else if (action === 'View Logs') {
        logger.show();
      }
    }
  } catch (err) {
    statusManager.hideBuildProgress();
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Build error', err, {
      component: 'extension',
      operation: 'build',
      data: { project: project.name },
    });
    await statusManager.showError(`Build error: ${message}`);
  }
}

/**
 * Runs the current ADK project.
 */
async function runCommand(
  configManager: ConfigurationManager,
  statusManager: StatusManager,
  projectTreeProvider: ProjectTreeProvider,
  logger: Logger,
  treeItem?: AdkTreeItem
): Promise<void> {
  if (isRunning()) {
    const action = await vscode.window.showWarningMessage(
      'An agent is already running. Stop it first?',
      'Stop and Run',
      'Cancel'
    );
    if (action !== 'Stop and Run') {
      return;
    }
    cancel();
  }

  let project: AdkProject | null = null;

  if (treeItem?.project) {
    project = treeItem.project;
  } else {
    project = await selectProject(projectTreeProvider, 'run');
  }

  if (!project) {
    return;
  }

  const settings = configManager.getSettings();

  logger.info(`Running project: ${project.name}`);

  if (!runOutputChannel) {
    runOutputChannel = vscode.window.createOutputChannel('ADK: Agent Output');
  }
  runOutputChannel.clear();
  runOutputChannel.show();

  try {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(project.path));
    const workspaceEnvFromFile = workspaceFolder
      ? loadEnvFile(workspaceFolder.uri.fsPath)
      : {};
    const projectEnvFromFile = loadEnvFile(project.path);

    const config: BuildConfig = {
      projectPath: project.path,
      command: 'run',
      args: [],
      env: {
        ...workspaceEnvFromFile,
        ...projectEnvFromFile,
      },
    };

    const proc = run(config, { cargoPath: settings.cargoPath ?? undefined });

    proc.stdout?.on('data', (data: Buffer) => {
      runOutputChannel?.append(data.toString());
    });

    proc.stderr?.on('data', (data: Buffer) => {
      runOutputChannel?.append(data.toString());
    });

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        runOutputChannel?.appendLine('\n[Process exited successfully]');
        logger.info(`Agent completed: ${project.name}`);
      } else {
        runOutputChannel?.appendLine(`\n[Process exited with code ${code}]`);
        logger.warn(`Agent exited with code ${code}: ${project.name}`);
      }
    });

    proc.on('error', (err: Error) => {
      runOutputChannel?.appendLine(`\n[Error: ${err.message}]`);
      logger.error('Run error', err, {
        component: 'extension',
        operation: 'run',
        data: { project: project.name },
      });
    });

    vscode.window.showInformationMessage(`Running ${project.name}...`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to run project', err, {
      component: 'extension',
      operation: 'run',
      data: { project: project.name },
    });
    await statusManager.showError(`Failed to run: ${message}`);
  }
}

/**
 * Checks the development environment.
 */
async function checkEnvironmentCommand(
  configManager: ConfigurationManager,
  statusManager: StatusManager,
  logger: Logger
): Promise<void> {
  logger.info('Checking environment...');
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Checking environment',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: 'Checking tools...' });

      const settings = configManager.getSettings();
      const envFilePath = workspaceFolder
        ? path.join(workspaceFolder.uri.fsPath, '.env')
        : null;

      const status: EnvironmentStatus = await checkEnvironment({
        rustcPath: settings.rustcPath,
        cargoPath: settings.cargoPath,
        adkStudioPath: settings.adkStudioPath,
        envFilePath,
      });

      const issues: string[] = [];

      if (!status.rustc.available) {
        issues.push(`Rust compiler (rustc): ${status.rustc.error || 'Not found'}`);
      }
      if (!status.cargo.available) {
        issues.push(`Cargo: ${status.cargo.error || 'Not found'}`);
      }
      if (!status.adkStudio.available) {
        issues.push(`ADK Studio: ${status.adkStudio.error || 'Not found'}`);
      }

      const missingKeys = status.apiKeys.filter(k => !k.present);
      for (const key of missingKeys) {
        issues.push(`API Key missing: ${key.name} (${key.envVar})`);
      }

      if (issues.length === 0) {
        const apiKeySummary = status.apiKeys.length > 0
          ? `, ${status.apiKeys.length} API key(s) configured`
          : '';
        logger.info('Environment check passed');
        await statusManager.showSuccess(
          `Environment OK: rustc ${status.rustc.version}, cargo ${status.cargo.version}${apiKeySummary}`
        );
      } else {
        logger.warn(`Environment issues: ${issues.join(', ')}`);

        const action = await statusManager.showError(
          `Environment issues found:\n${issues.join('\n')}`,
          'Install Rust',
          'View Details'
        );

        if (action === 'Install Rust') {
          vscode.env.openExternal(vscode.Uri.parse('https://rustup.rs'));
        } else if (action === 'View Details') {
          const details = [
            '# Environment Check Results\n',
            `## Rust Compiler (rustc)`,
            `- Available: ${status.rustc.available}`,
            status.rustc.version ? `- Version: ${status.rustc.version}` : '',
            status.rustc.path ? `- Path: ${status.rustc.path}` : '',
            status.rustc.error ? `- Error: ${status.rustc.error}` : '',
            '',
            `## Cargo`,
            `- Available: ${status.cargo.available}`,
            status.cargo.version ? `- Version: ${status.cargo.version}` : '',
            status.cargo.path ? `- Path: ${status.cargo.path}` : '',
            status.cargo.error ? `- Error: ${status.cargo.error}` : '',
            '',
            `## ADK Studio`,
            `- Available: ${status.adkStudio.available}`,
            status.adkStudio.version ? `- Version: ${status.adkStudio.version}` : '',
            status.adkStudio.path ? `- Path: ${status.adkStudio.path}` : '',
            status.adkStudio.error ? `- Error: ${status.adkStudio.error}` : '',
          ];

          if (status.apiKeys.length > 0) {
            details.push('');
            details.push(`## API Keys${workspaceFolder ? ` (${workspaceFolder.name})` : ''}`);
            for (const key of status.apiKeys) {
              const icon = key.present ? '✅' : '❌';
              details.push(`- ${icon} ${key.name} (\`${key.envVar}\`): ${key.present ? 'Configured' : 'Missing'}`);
            }
          }

          const doc = await vscode.workspace.openTextDocument({
            content: details.filter((line) => line !== '').join('\n'),
            language: 'markdown',
          });
          await vscode.window.showTextDocument(doc);
        }
      }
    }
  );
}

/**
 * Supported API key providers for the configuration UI.
 */
const SUPPORTED_API_KEYS = [
  { envVar: 'GOOGLE_API_KEY', label: 'Google API Key', description: 'Required for Gemini models' },
  { envVar: 'GOOGLE_SEARCH_API_KEY', label: 'Google Search API Key', description: 'Required for search tools' },
  { envVar: 'OPENAI_API_KEY', label: 'OpenAI API Key', description: 'For OpenAI model access' },
  { envVar: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', description: 'For Claude model access' },
];

/**
 * Handles the API key configuration command.
 *
 * @param logger - Logger instance for structured logging
 */
async function configureApiKeysCommand(logger: Logger): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Open a workspace folder first.');
    return;
  }

  const selected = await vscode.window.showQuickPick(
    SUPPORTED_API_KEYS.map(k => ({
      label: k.label,
      description: k.description,
      envVar: k.envVar,
    })),
    {
      title: 'Configure API Key',
      placeHolder: 'Select an API key provider',
    }
  );

  if (!selected) {
    return;
  }

  const value = await vscode.window.showInputBox({
    title: `Enter ${selected.label}`,
    prompt: `Enter the value for ${selected.envVar}`,
    password: true,
    placeHolder: 'Paste your API key here',
    validateInput: (input) => {
      if (!input || input.trim().length === 0) {
        return 'API key value cannot be empty';
      }
      return undefined;
    },
  });

  if (!value) {
    return;
  }

  const envPath = path.join(workspaceFolder.uri.fsPath, '.env');
  const envUri = vscode.Uri.file(envPath);

  let envContent = '';
  try {
    const existingContent = await vscode.workspace.fs.readFile(envUri);
    envContent = Buffer.from(existingContent).toString('utf-8');
  } catch {
    logger.info('.env file not found, creating new one');
  }

  const updatedContent = updateEnvKey(envContent, selected.envVar, value);
  await vscode.workspace.fs.writeFile(envUri, Buffer.from(updatedContent, 'utf-8'));

  const maskedLog = maskSensitiveData({ [selected.envVar]: value });
  logger.info(`Updated API key: ${JSON.stringify(maskedLog)}`);

  vscode.window.showInformationMessage(`${selected.label} has been configured in .env`);
}

/**
 * Prompts user to select a project if multiple exist.
 */
async function selectProject(
  projectTreeProvider: ProjectTreeProvider,
  action: string
): Promise<AdkProject | null> {
  const projects = projectTreeProvider.getProjects();

  if (projects.length === 0) {
    vscode.window.showWarningMessage('No ADK projects found in workspace.');
    return null;
  }

  if (projects.length === 1) {
    return projects[0];
  }

  const items = projects.map((p) => ({
    label: p.name,
    description: p.path,
    project: p,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: `Select project to ${action}`,
    placeHolder: 'Choose an ADK project',
  });

  return selected?.project ?? null;
}
