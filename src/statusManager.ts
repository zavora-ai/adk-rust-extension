/**
 * Status Manager for ADK Rust extension.
 *
 * Manages status bar items and progress indicators for server status,
 * build operations, and user notifications.
 *
 * @module statusManager
 *
 * **Validates: Requirements 6.1-6.6**
 */

import * as vscode from 'vscode';

/**
 * Server status information for display.
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
 * Status bar item priority (higher = more left).
 */
const STATUS_BAR_PRIORITY = 100;

/**
 * Status bar icons for different states.
 */
const ICONS = {
  serverRunning: '$(radio-tower)',
  serverStopped: '$(circle-slash)',
  serverStarting: '$(sync~spin)',
  building: '$(gear~spin)',
  success: '$(check)',
  error: '$(error)',
} as const;

/**
 * Manages status bar items and progress indicators for the ADK Rust extension.
 *
 * Provides visual feedback for:
 * - ADK Studio server status (running/stopped/starting)
 * - Build progress with cancellation support
 * - Success and error notifications
 *
 * @example
 * const statusManager = new StatusManager();
 *
 * // Show server status
 * statusManager.showServerStatus({ running: true, port: 3000, pid: 1234, url: 'http://localhost:3000' });
 *
 * // Show build progress
 * statusManager.showBuildProgress('Building project...');
 *
 * // Show notifications
 * statusManager.showSuccess('Build completed successfully');
 * statusManager.showError('Build failed: missing dependency');
 */
export class StatusManager implements vscode.Disposable {
  private readonly serverStatusItem: vscode.StatusBarItem;
  private readonly buildStatusItem: vscode.StatusBarItem;
  private buildProgressResolve: (() => void) | null = null;

  /**
   * Creates a new StatusManager instance.
   * Initializes status bar items for server and build status.
   */
  constructor() {
    // Server status item (left side of status bar)
    this.serverStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      STATUS_BAR_PRIORITY
    );
    this.serverStatusItem.name = 'ADK Studio Server';
    this.serverStatusItem.command = 'adkRust.openStudio';

    // Build status item (left side, next to server status)
    this.buildStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      STATUS_BAR_PRIORITY - 1
    );
    this.buildStatusItem.name = 'ADK Build Status';

    // Initialize with stopped state
    this.showServerStopped();
  }

  /**
   * Updates the status bar to show server status.
   *
   * @param status - Current server status
   *
   * @example
   * statusManager.showServerStatus({
   *   running: true,
   *   port: 3000,
   *   pid: 1234,
   *   url: 'http://localhost:3000'
   * });
   */
  showServerStatus(status: ServerStatus): void {
    if (status.running) {
      this.serverStatusItem.text = `${ICONS.serverRunning} ADK Studio`;
      this.serverStatusItem.tooltip = `ADK Studio running on port ${status.port}\nClick to open Studio`;
      this.serverStatusItem.backgroundColor = undefined;
    } else {
      this.showServerStopped();
    }
    this.serverStatusItem.show();
  }

  /**
   * Shows the server as starting with a spinning indicator.
   *
   * @param port - Port the server is starting on
   */
  showServerStarting(port: number): void {
    this.serverStatusItem.text = `${ICONS.serverStarting} ADK Studio`;
    this.serverStatusItem.tooltip = `Starting ADK Studio on port ${port}...`;
    this.serverStatusItem.backgroundColor = undefined;
    this.serverStatusItem.show();
  }

  /**
   * Shows the server as stopped.
   */
  showServerStopped(): void {
    this.serverStatusItem.text = `${ICONS.serverStopped} ADK Studio`;
    this.serverStatusItem.tooltip = 'ADK Studio not running\nClick to start';
    this.serverStatusItem.backgroundColor = undefined;
    this.serverStatusItem.show();
  }

  /**
   * Shows the server as crashed with error styling.
   *
   * @param reason - Reason for the crash
   */
  showServerCrashed(reason: string): void {
    this.serverStatusItem.text = `${ICONS.error} ADK Studio`;
    this.serverStatusItem.tooltip = `ADK Studio crashed: ${reason}\nClick to restart`;
    this.serverStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.serverStatusItem.show();
  }

  /**
   * Shows build progress in the status bar.
   * Only one build progress can be shown at a time.
   *
   * @param message - Progress message to display
   *
   * @example
   * statusManager.showBuildProgress('Compiling...');
   * // Later:
   * statusManager.hideBuildProgress();
   */
  showBuildProgress(message: string): void {
    this.buildStatusItem.text = `${ICONS.building} ${message}`;
    this.buildStatusItem.tooltip = message;
    this.buildStatusItem.backgroundColor = undefined;
    this.buildStatusItem.show();
  }

  /**
   * Updates the build progress message.
   *
   * @param message - New progress message
   */
  updateBuildProgress(message: string): void {
    if (this.buildStatusItem.text.startsWith(ICONS.building)) {
      this.buildStatusItem.text = `${ICONS.building} ${message}`;
      this.buildStatusItem.tooltip = message;
    }
  }

  /**
   * Hides the build progress indicator.
   */
  hideBuildProgress(): void {
    this.buildStatusItem.hide();
    if (this.buildProgressResolve) {
      this.buildProgressResolve();
      this.buildProgressResolve = null;
    }
  }

  /**
   * Shows build progress with VS Code's progress notification.
   * Returns a promise that resolves when the progress is hidden.
   *
   * @param title - Title for the progress notification
   * @param cancellable - Whether the operation can be cancelled
   * @returns Promise that resolves when progress is complete, with cancellation token
   *
   * @example
   * const { token } = await statusManager.showBuildProgressWithNotification('Building project', true);
   * // Do work, checking token.isCancellationRequested
   * statusManager.hideBuildProgress();
   */
  async showBuildProgressWithNotification(
    title: string,
    cancellable: boolean = false
  ): Promise<{ token: vscode.CancellationToken }> {
    this.showBuildProgress(title);

    return new Promise((resolve) => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title,
          cancellable,
        },
        async (_progress, token) => {
          resolve({ token });

          // Wait until hideBuildProgress is called
          await new Promise<void>((progressResolve) => {
            this.buildProgressResolve = progressResolve;
          });
        }
      );
    });
  }

  /**
   * Shows an error notification with optional actions.
   *
   * @param message - Error message to display
   * @param actions - Optional action buttons
   * @returns Promise resolving to the selected action, or undefined
   *
   * @example
   * const action = await statusManager.showError(
   *   'Build failed: missing dependency',
   *   'View Logs',
   *   'Retry'
   * );
   * if (action === 'View Logs') {
   *   // Show logs
   * }
   */
  async showError(message: string, ...actions: string[]): Promise<string | undefined> {
    return vscode.window.showErrorMessage(message, ...actions);
  }

  /**
   * Shows a success notification with optional actions.
   *
   * @param message - Success message to display
   * @param actions - Optional action buttons
   * @returns Promise resolving to the selected action, or undefined
   *
   * @example
   * await statusManager.showSuccess('Build completed successfully');
   */
  async showSuccess(message: string, ...actions: string[]): Promise<string | undefined> {
    return vscode.window.showInformationMessage(message, ...actions);
  }

  /**
   * Shows a warning notification with optional actions.
   *
   * @param message - Warning message to display
   * @param actions - Optional action buttons
   * @returns Promise resolving to the selected action, or undefined
   *
   * @example
   * const action = await statusManager.showWarning(
   *   'ADK Studio not found',
   *   'Install',
   *   'Ignore'
   * );
   */
  async showWarning(message: string, ...actions: string[]): Promise<string | undefined> {
    return vscode.window.showWarningMessage(message, ...actions);
  }

  /**
   * Disposes of all status bar items and cleans up resources.
   */
  dispose(): void {
    this.serverStatusItem.dispose();
    this.buildStatusItem.dispose();
    if (this.buildProgressResolve) {
      this.buildProgressResolve();
      this.buildProgressResolve = null;
    }
  }
}
