/**
 * Sidebar fallback logic for the ADK Rust extension.
 *
 * Encapsulates the try/catch registration of the SidebarWebviewProvider
 * with automatic fallback to the native ProjectTreeProvider when the
 * webview fails to register. Also provides a re-registration attempt
 * on manual refresh.
 *
 * @module sidebarFallback
 */

import * as vscode from 'vscode';
import { getLogger } from './logger';
import { SidebarWebviewProvider } from './sidebarWebviewProvider';
import type { MessageBus } from './messageBus';
import type { ProjectTreeProvider } from './projectTreeProvider';

/**
 * Result of a sidebar registration attempt.
 *
 * Contains enough information for the caller to know which mode is
 * active and to dispose the current registration before switching.
 */
export interface SidebarRegistrationResult {
  /** Whether the webview provider was successfully registered. */
  isWebview: boolean;
  /** The disposable for the registration (either webview or tree view). */
  disposable: vscode.Disposable;
  /** The sidebar provider if webview was successful, null if fallback. */
  sidebarProvider: SidebarWebviewProvider | null;
}

/**
 * Attempts to register the SidebarWebviewProvider for the `adkProjects`
 * view. If registration throws, falls back to the native
 * ProjectTreeProvider and logs a warning.
 *
 * @param context - The VS Code extension context
 * @param messageBus - The MessageBus instance for sidebar↔Studio sync
 * @param projectTreeProvider - The tree provider used as fallback
 * @returns The registration result indicating which mode is active
 *
 * @example
 * const result = registerSidebarWithFallback(context, messageBus, treeProvider);
 * if (!result.isWebview) {
 *   // running in fallback mode
 * }
 */
export function registerSidebarWithFallback(
  context: vscode.ExtensionContext,
  messageBus: MessageBus,
  projectTreeProvider: ProjectTreeProvider,
): SidebarRegistrationResult {
  const logger = getLogger();

  try {
    const provider = new SidebarWebviewProvider(context, messageBus);
    const registration = vscode.window.registerWebviewViewProvider(
      SidebarWebviewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } },
    );

    logger.info('Sidebar webview provider registered successfully');
    return { isWebview: true, disposable: registration, sidebarProvider: provider };
  } catch (error: unknown) {
    logger.warn(
      `Sidebar webview failed to register, activating native tree view fallback: ${error instanceof Error ? error.message : String(error)}`,
    );

    const treeView = vscode.window.createTreeView(SidebarWebviewProvider.viewType, {
      treeDataProvider: projectTreeProvider,
      showCollapseAll: true,
    });

    return { isWebview: false, disposable: treeView, sidebarProvider: null };
  }
}

/**
 * Attempts to reload the sidebar webview when the native tree view
 * fallback is currently active. If the webview is already active,
 * returns the current result unchanged.
 *
 * On failure the tree view is re-registered so the user always has
 * a working sidebar.
 *
 * @param context - The VS Code extension context
 * @param messageBus - The MessageBus instance for sidebar↔Studio sync
 * @param projectTreeProvider - The tree provider used as fallback
 * @param currentResult - The current sidebar registration result
 * @returns A new registration result (webview on success, tree view on failure)
 *
 * @example
 * // On manual refresh command:
 * sidebarResult = attemptWebviewReload(context, bus, treeProvider, sidebarResult);
 */
export function attemptWebviewReload(
  context: vscode.ExtensionContext,
  messageBus: MessageBus,
  projectTreeProvider: ProjectTreeProvider,
  currentResult: SidebarRegistrationResult,
): SidebarRegistrationResult {
  if (currentResult.isWebview) {
    return currentResult;
  }

  const logger = getLogger();
  logger.info('Attempting to reload sidebar webview from fallback mode');

  // Dispose the current tree view registration before re-registering
  currentResult.disposable.dispose();

  return registerSidebarWithFallback(context, messageBus, projectTreeProvider);
}
