import * as vscode from 'vscode';

/**
 * Template types available for new ADK projects.
 */
export type TemplateType = 'simple-chat' | 'tool-using-agent' | 'multi-agent-workflow' | 'graph-workflow';

/**
 * Verbosity levels for output channel logging.
 */
export type VerbosityLevel = 'quiet' | 'normal' | 'verbose';

/**
 * Extension settings interface matching the configuration schema in package.json.
 */
export interface ExtensionSettings {
  /** Port number for the ADK Studio server (default: 3000) */
  studioPort: number;
  /** Default template for new ADK projects */
  defaultTemplate: TemplateType;
  /** Custom path to the adk-studio binary, or null to use PATH */
  adkStudioPath: string | null;
  /** Custom path to the cargo binary, or null to use PATH */
  cargoPath: string | null;
  /** Custom path to the rustc binary, or null to use PATH */
  rustcPath: string | null;
  /** Automatically start the ADK Studio server on extension activation */
  autoStartStudio: boolean;
  /** Output channel verbosity level */
  verbosity: VerbosityLevel;
  /** Whether to auto-open Studio webview on activation when ADK projects are detected (default: true) */
  studioAutoOpen: boolean;
  /** Whether to use the sidebar webview or native tree view (default: true) */
  sidebarWebview: boolean;
}

/**
 * Default settings values matching package.json defaults.
 */
const DEFAULT_SETTINGS: ExtensionSettings = {
  studioPort: 3000,
  defaultTemplate: 'simple-chat',
  adkStudioPath: null,
  cargoPath: null,
  rustcPath: null,
  autoStartStudio: true,
  verbosity: 'normal',
  studioAutoOpen: true,
  sidebarWebview: true,
};

/**
 * Configuration section name in VS Code settings.
 */
const CONFIG_SECTION = 'adkRust';

/**
 * Callback type for settings change events.
 */
type SettingsChangedCallback = (settings: ExtensionSettings) => void;

/**
 * Manages extension configuration and settings.
 * Provides type-safe access to VS Code configuration with change notifications.
 *
 * @example
 * const configManager = new ConfigurationManager();
 * const port = configManager.getSetting('studioPort');
 *
 * const disposable = configManager.onSettingsChanged((settings) => {
 *   console.log('Settings changed:', settings);
 * });
 */
export class ConfigurationManager implements vscode.Disposable {
  private readonly callbacks: Set<SettingsChangedCallback> = new Set();
  private readonly configChangeDisposable: vscode.Disposable;
  private cachedSettings: ExtensionSettings | null = null;

  constructor() {
    // Listen for configuration changes
    this.configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_SECTION)) {
        // Invalidate cache
        this.cachedSettings = null;
        // Notify all listeners
        const newSettings = this.getSettings();
        this.callbacks.forEach((callback) => {
          try {
            callback(newSettings);
          } catch {
            // Prevent one callback from breaking others - errors are silently ignored
            // as we don't want one faulty callback to affect others
          }
        });
      }
    });
  }

  /**
   * Gets all extension settings with defaults applied.
   *
   * @returns Complete extension settings object
   *
   * @example
   * const settings = configManager.getSettings();
   * console.log(`Studio port: ${settings.studioPort}`);
   */
  getSettings(): ExtensionSettings {
    if (this.cachedSettings) {
      return { ...this.cachedSettings };
    }

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

    this.cachedSettings = {
      studioPort: config.get<number>('studioPort', DEFAULT_SETTINGS.studioPort),
      defaultTemplate: config.get<TemplateType>('defaultTemplate', DEFAULT_SETTINGS.defaultTemplate),
      adkStudioPath: config.get<string | null>('adkStudioPath', DEFAULT_SETTINGS.adkStudioPath),
      cargoPath: config.get<string | null>('cargoPath', DEFAULT_SETTINGS.cargoPath),
      rustcPath: config.get<string | null>('rustcPath', DEFAULT_SETTINGS.rustcPath),
      autoStartStudio: config.get<boolean>('autoStartStudio', DEFAULT_SETTINGS.autoStartStudio),
      verbosity: config.get<VerbosityLevel>('verbosity', DEFAULT_SETTINGS.verbosity),
      studioAutoOpen: config.get<boolean>('studioAutoOpen', DEFAULT_SETTINGS.studioAutoOpen),
      sidebarWebview: config.get<boolean>('sidebarWebview', DEFAULT_SETTINGS.sidebarWebview),
    };

    return { ...this.cachedSettings };
  }

  /**
   * Gets a specific setting value with type safety.
   *
   * @param key - The setting key to retrieve
   * @returns The setting value
   *
   * @example
   * const port = configManager.getSetting('studioPort');
   * const template = configManager.getSetting('defaultTemplate');
   */
  getSetting<K extends keyof ExtensionSettings>(key: K): ExtensionSettings[K] {
    return this.getSettings()[key];
  }

  /**
   * Updates a specific setting value.
   * Changes are persisted to VS Code's global configuration.
   *
   * @param key - The setting key to update
   * @param value - The new value
   * @returns Promise that resolves when the setting is updated
   *
   * @example
   * await configManager.updateSetting('studioPort', 8080);
   * await configManager.updateSetting('verbosity', 'verbose');
   */
  async updateSetting<K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K]
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
    // Cache will be invalidated by the onDidChangeConfiguration event
  }

  /**
   * Registers a callback to be invoked when settings change.
   * The callback receives the complete new settings object.
   *
   * @param callback - Function to call when settings change
   * @returns Disposable to unregister the callback
   *
   * @example
   * const disposable = configManager.onSettingsChanged((settings) => {
   *   if (settings.verbosity === 'verbose') {
   *     enableDebugLogging();
   *   }
   * });
   *
   * // Later, to stop listening:
   * disposable.dispose();
   */
  onSettingsChanged(callback: SettingsChangedCallback): vscode.Disposable {
    this.callbacks.add(callback);

    return {
      dispose: () => {
        this.callbacks.delete(callback);
      },
    };
  }

  /**
   * Disposes of the configuration manager and cleans up resources.
   */
  dispose(): void {
    this.configChangeDisposable.dispose();
    this.callbacks.clear();
    this.cachedSettings = null;
  }
}
