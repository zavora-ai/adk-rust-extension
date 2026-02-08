/**
 * Mock VS Code API for unit testing.
 * These mocks allow testing extension logic without VS Code runtime.
 */

export interface MockConfiguration {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Promise<void>;
}

export interface MockWorkspaceConfiguration extends MockConfiguration {
  inspect<T>(key: string): { defaultValue?: T; globalValue?: T; workspaceValue?: T } | undefined;
}

/**
 * Creates a mock workspace configuration.
 */
export function createMockConfiguration(
  values: Record<string, unknown> = {}
): MockWorkspaceConfiguration {
  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      const value = values[key];
      if (value !== undefined) return value as T;
      return defaultValue;
    },
    update: async (_key: string, _value: unknown): Promise<void> => {
      // No-op for tests
    },
    inspect<T>(key: string) {
      const value = values[key];
      if (value !== undefined) {
        return { defaultValue: value as T };
      }
      return undefined;
    }
  };
}

/**
 * Mock output channel for testing logging.
 */
export interface MockOutputChannel {
  name: string;
  messages: string[];
  append(value: string): void;
  appendLine(value: string): void;
  clear(): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

export function createMockOutputChannel(name: string): MockOutputChannel {
  return {
    name,
    messages: [],
    append(value: string) {
      this.messages.push(value);
    },
    appendLine(value: string) {
      this.messages.push(value + '\n');
    },
    clear() {
      this.messages = [];
    },
    show() {
      // No-op
    },
    hide() {
      // No-op
    },
    dispose() {
      // No-op
    }
  };
}

/**
 * Mock status bar item for testing.
 */
export interface MockStatusBarItem {
  text: string;
  tooltip: string | undefined;
  command: string | undefined;
  show(): void;
  hide(): void;
  dispose(): void;
}

export function createMockStatusBarItem(): MockStatusBarItem {
  return {
    text: '',
    tooltip: undefined,
    command: undefined,
    show() {
      // No-op
    },
    hide() {
      // No-op
    },
    dispose() {
      // No-op
    }
  };
}

/**
 * Mock event emitter for testing.
 */
export class MockEventEmitter<T> {
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

  fire(data: T) {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose() {
    this.listeners = [];
  }
}

/**
 * Mock disposable for testing.
 */
export interface MockDisposable {
  dispose(): void;
}

export function createMockDisposable(): MockDisposable {
  return {
    dispose() {
      // No-op
    }
  };
}
