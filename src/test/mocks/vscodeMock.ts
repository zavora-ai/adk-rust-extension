/**
 * Complete VS Code mock module for unit testing.
 * This module provides mock implementations of VS Code APIs
 * that can be used to test extension code without the VS Code runtime.
 */

// Store for mock configuration values
const mockConfigValues: Record<string, unknown> = {};

// Store for configuration change listeners
const mockChangeListeners: Array<(e: { affectsConfiguration: (section: string) => boolean }) => void> = [];

/**
 * Fires a configuration change event to all registered listeners.
 */
export function fireConfigChange(section: string): void {
  const event = {
    affectsConfiguration: (s: string) => s === section || section.startsWith(s + '.')
  };
  for (const listener of mockChangeListeners) {
    listener(event);
  }
}

/**
 * Resets all mock state.
 */
export function resetMocks(): void {
  for (const key of Object.keys(mockConfigValues)) {
    delete mockConfigValues[key];
  }
  mockChangeListeners.length = 0;
}

/**
 * Sets a mock configuration value.
 */
export function setMockConfigValue(key: string, value: unknown): void {
  mockConfigValues[key] = value;
}

/**
 * Gets a mock configuration value.
 */
export function getMockConfigValue(key: string): unknown {
  return mockConfigValues[key];
}

/**
 * Mock workspace configuration.
 */
const mockWorkspaceConfiguration = {
  get: <T>(key: string, defaultValue?: T): T => {
    const value = mockConfigValues[key];
    if (value !== undefined) {
      return value as T;
    }
    return defaultValue as T;
  },
  update: async (key: string, value: unknown, _target: unknown): Promise<void> => {
    mockConfigValues[key] = value;
    fireConfigChange('adkRust');
  },
  inspect: <T>(key: string): { defaultValue?: T; globalValue?: T; workspaceValue?: T } | undefined => {
    const value = mockConfigValues[key];
    if (value !== undefined) {
      return { defaultValue: value as T };
    }
    return undefined;
  }
};

/**
 * Mock FileSystemWatcher.
 */
export class MockFileSystemWatcher {
  private createListeners: Array<() => void> = [];
  private deleteListeners: Array<() => void> = [];
  private changeListeners: Array<() => void> = [];

  onDidCreate(listener: () => void) {
    this.createListeners.push(listener);
    return { dispose: () => {} };
  }

  onDidDelete(listener: () => void) {
    this.deleteListeners.push(listener);
    return { dispose: () => {} };
  }

  onDidChange(listener: () => void) {
    this.changeListeners.push(listener);
    return { dispose: () => {} };
  }

  dispose(): void {
    this.createListeners = [];
    this.deleteListeners = [];
    this.changeListeners = [];
  }
}

/**
 * Mock workspace namespace.
 */
export const workspace = {
  getConfiguration: (_section: string) => mockWorkspaceConfiguration,
  onDidChangeConfiguration: (listener: (e: { affectsConfiguration: (section: string) => boolean }) => void) => {
    mockChangeListeners.push(listener);
    return {
      dispose: () => {
        const index = mockChangeListeners.indexOf(listener);
        if (index >= 0) {
          mockChangeListeners.splice(index, 1);
        }
      }
    };
  },
  createFileSystemWatcher: (_pattern: string) => new MockFileSystemWatcher(),
  workspaceFolders: undefined as undefined | Array<{ uri: { fsPath: string } }>
};

/**
 * Mock ConfigurationTarget enum.
 */
export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3
};

/**
 * Mock Disposable interface.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Mock StatusBarAlignment enum.
 */
export const StatusBarAlignment = {
  Left: 1,
  Right: 2
};

/**
 * Mock ProgressLocation enum.
 */
export const ProgressLocation = {
  SourceControl: 1,
  Window: 10,
  Notification: 15
};

/**
 * Mock ThemeColor class.
 */
export class ThemeColor {
  id: string;

  constructor(id: string) {
    this.id = id;
  }
}

/**
 * Mock StatusBarItem class.
 */
export class MockStatusBarItem {
  text: string = '';
  tooltip: string | undefined = undefined;
  command: string | undefined = undefined;
  backgroundColor: ThemeColor | undefined = undefined;
  name: string | undefined = undefined;
  alignment: number;
  priority: number;
  private visible: boolean = false;

  constructor(alignment: number = StatusBarAlignment.Left, priority: number = 0) {
    this.alignment = alignment;
    this.priority = priority;
  }

  show(): void {
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.visible = false;
  }
}

/**
 * Mock window namespace.
 */
export const window = {
  showInformationMessage: async (_message: string, ..._items: string[]): Promise<string | undefined> => undefined,
  showWarningMessage: async (_message: string, ..._items: string[]): Promise<string | undefined> => undefined,
  showErrorMessage: async (_message: string, ..._items: string[]): Promise<string | undefined> => undefined,
  createOutputChannel: (name: string) => ({
    name,
    append: (_value: string) => {},
    appendLine: (_value: string) => {},
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {}
  }),
  createStatusBarItem: (alignment?: number, priority?: number) => new MockStatusBarItem(alignment, priority),
  withProgress: async <T>(
    _options: { location: number; title: string; cancellable?: boolean },
    task: (
      progress: { report: (value: { message?: string; increment?: number }) => void },
      token: { isCancellationRequested: boolean; onCancellationRequested: unknown }
    ) => Promise<T>
  ): Promise<T> => {
    const progress = { report: (_value: { message?: string; increment?: number }) => {} };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: { dispose: () => {} }
    };
    return task(progress, token);
  }
};

/**
 * Mock Uri class.
 */
export const Uri = {
  file: (path: string) => ({ fsPath: path, path, scheme: 'file' }),
  parse: (value: string) => ({ fsPath: value, path: value, scheme: 'file' })
};

/**
 * Mock env namespace.
 */
export const env = {
  openExternal: async (_target: unknown): Promise<boolean> => true
};

/**
 * Mock TreeItemCollapsibleState enum.
 */
export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2
};

/**
 * Mock TreeItem class.
 */
export class TreeItem {
  label: string;
  collapsibleState: number;
  tooltip?: string;
  contextValue?: string;
  iconPath?: unknown;
  description?: string;
  command?: unknown;

  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState ?? TreeItemCollapsibleState.None;
  }
}

/**
 * Mock ThemeIcon class.
 */
export class ThemeIcon {
  id: string;
  color?: unknown;

  constructor(id: string, color?: unknown) {
    this.id = id;
    this.color = color;
  }
}

/**
 * Mock Range class.
 */
export class Range {
  start: { line: number; character: number };
  end: { line: number; character: number };

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
    this.start = { line: startLine, character: startCharacter };
    this.end = { line: endLine, character: endCharacter };
  }
}

/**
 * Mock EventEmitter class.
 */
export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];

  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) {
          this.listeners.splice(index, 1);
        }
      }
    };
  };

  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

// Default export for module replacement
export default {
  workspace,
  window,
  ConfigurationTarget,
  StatusBarAlignment,
  ProgressLocation,
  ThemeColor,
  Uri,
  env,
  TreeItemCollapsibleState,
  TreeItem,
  ThemeIcon,
  Range,
  EventEmitter
};
