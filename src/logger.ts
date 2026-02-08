/**
 * Logger module for ADK Rust extension.
 *
 * Provides structured logging with multiple log levels and error formatting
 * with context and stack traces.
 *
 * @module logger
 *
 * **Validates: Requirements 6.4, 6.5**
 */

import * as vscode from 'vscode';

/**
 * Log levels for the logger.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Numeric values for log levels (lower = more verbose).
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Display prefixes for each log level.
 */
const LOG_LEVEL_PREFIXES: Record<LogLevel, string> = {
  debug: '[DEBUG]',
  info: '[INFO]',
  warn: '[WARN]',
  error: '[ERROR]',
};

/**
 * Context information for error logging.
 */
export interface ErrorContext {
  /** Component or module where the error occurred */
  component?: string;
  /** Operation being performed when error occurred */
  operation?: string;
  /** Additional context data */
  data?: Record<string, unknown>;
}

/**
 * Sensitive keys that should be masked in logs.
 * SECURITY: Prevents accidental exposure of secrets.
 */
const SENSITIVE_KEYS = ['API_KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'CREDENTIAL', 'KEY'];

/**
 * Masks sensitive values in an object for safe logging.
 *
 * @param obj - Object to mask
 * @returns Object with sensitive values replaced with '***REDACTED***'
 */
export function maskSensitiveData(obj: Record<string, unknown>): Record<string, string> {
  const masked: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const upperKey = key.toUpperCase();
    const isSensitive = SENSITIVE_KEYS.some((s) => upperKey.includes(s));

    if (isSensitive) {
      masked[key] = value ? '***REDACTED***' : '(not set)';
    } else if (typeof value === 'object' && value !== null) {
      try {
        masked[key] = JSON.stringify(value);
      } catch {
        masked[key] = '[unserializable object]';
      }
    } else {
      masked[key] = String(value);
    }
  }

  return masked;
}

/**
 * Formats an error with context and stack trace for logging.
 *
 * @param error - The error to format
 * @param context - Optional context information
 * @returns Formatted error string
 */
export function formatError(error: unknown, context?: ErrorContext): string {
  const lines: string[] = [];

  // Error type and message
  if (error instanceof Error) {
    lines.push(`Error: ${error.name}: ${error.message}`);
  } else {
    lines.push(`Error: ${String(error)}`);
  }

  // Context information
  if (context) {
    if (context.component) {
      lines.push(`  Component: ${context.component}`);
    }
    if (context.operation) {
      lines.push(`  Operation: ${context.operation}`);
    }
    if (context.data) {
      const maskedData = maskSensitiveData(context.data);
      lines.push(`  Context: ${JSON.stringify(maskedData)}`);
    }
  }

  // Stack trace
  if (error instanceof Error && error.stack) {
    lines.push('  Stack trace:');
    const stackLines = error.stack.split('\n').slice(1); // Skip first line (error message)
    for (const line of stackLines) {
      lines.push(`    ${line.trim()}`);
    }
  }

  return lines.join('\n');
}

/**
 * Logger class for the ADK Rust extension.
 *
 * Provides structured logging with configurable log levels and
 * automatic error formatting with context and stack traces.
 *
 * @example
 * const logger = new Logger('ADK Rust');
 * logger.info('Extension activated');
 * logger.error('Failed to start server', new Error('Connection refused'), {
 *   component: 'StudioManager',
 *   operation: 'startServer',
 *   data: { port: 3000 }
 * });
 */
export class Logger implements vscode.Disposable {
  private readonly outputChannel: vscode.OutputChannel;
  private minLevel: LogLevel = 'info';

  /**
   * Creates a new Logger instance.
   *
   * @param name - Name for the output channel
   */
  constructor(name: string) {
    this.outputChannel = vscode.window.createOutputChannel(name);
  }

  /**
   * Sets the minimum log level.
   * Messages below this level will not be logged.
   *
   * @param level - Minimum log level to display
   *
   * @example
   * logger.setLevel('debug'); // Show all messages
   * logger.setLevel('warn');  // Only show warnings and errors
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Gets the current minimum log level.
   *
   * @returns Current minimum log level
   */
  getLevel(): LogLevel {
    return this.minLevel;
  }

  /**
   * Checks if a log level should be logged based on current minimum level.
   *
   * @param level - Level to check
   * @returns True if the level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.minLevel];
  }

  /**
   * Formats a log message with timestamp and level prefix.
   *
   * @param level - Log level
   * @param message - Message to format
   * @returns Formatted log line
   */
  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const prefix = LOG_LEVEL_PREFIXES[level];
    return `[${timestamp}] ${prefix} ${message}`;
  }

  /**
   * Logs a message at the specified level.
   *
   * @param level - Log level
   * @param message - Message to log
   */
  private log(level: LogLevel, message: string): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formatted = this.formatMessage(level, message);
    this.outputChannel.appendLine(formatted);
  }

  /**
   * Logs a debug message.
   * Only shown when log level is 'debug'.
   *
   * @param message - Message to log
   *
   * @example
   * logger.debug('Processing file: config.json');
   */
  debug(message: string): void {
    this.log('debug', message);
  }

  /**
   * Logs an info message.
   * Shown when log level is 'debug' or 'info'.
   *
   * @param message - Message to log
   *
   * @example
   * logger.info('Server started on port 3000');
   */
  info(message: string): void {
    this.log('info', message);
  }

  /**
   * Logs a warning message.
   * Shown when log level is 'debug', 'info', or 'warn'.
   *
   * @param message - Message to log
   *
   * @example
   * logger.warn('Configuration file not found, using defaults');
   */
  warn(message: string): void {
    this.log('warn', message);
  }

  /**
   * Logs an error message with optional error object and context.
   * Always shown regardless of log level.
   *
   * @param message - Error message
   * @param error - Optional error object
   * @param context - Optional context information
   *
   * @example
   * logger.error('Failed to start server', error, {
   *   component: 'StudioManager',
   *   operation: 'startServer',
   *   data: { port: 3000 }
   * });
   */
  error(message: string, error?: unknown, context?: ErrorContext): void {
    if (!this.shouldLog('error')) {
      return;
    }

    const formatted = this.formatMessage('error', message);
    this.outputChannel.appendLine(formatted);

    if (error) {
      const errorDetails = formatError(error, context);
      this.outputChannel.appendLine(errorDetails);
    } else if (context) {
      // Log context even without error
      if (context.component) {
        this.outputChannel.appendLine(`  Component: ${context.component}`);
      }
      if (context.operation) {
        this.outputChannel.appendLine(`  Operation: ${context.operation}`);
      }
      if (context.data) {
        const maskedData = maskSensitiveData(context.data);
        this.outputChannel.appendLine(`  Context: ${JSON.stringify(maskedData)}`);
      }
    }
  }

  /**
   * Shows the output channel in the VS Code panel.
   *
   * @param preserveFocus - If true, the editor focus is not moved to the output channel
   *
   * @example
   * logger.show(); // Show and focus
   * logger.show(true); // Show but keep focus on editor
   */
  show(preserveFocus?: boolean): void {
    this.outputChannel.show(preserveFocus);
  }

  /**
   * Hides the output channel.
   */
  hide(): void {
    this.outputChannel.hide();
  }

  /**
   * Clears all messages from the output channel.
   */
  clear(): void {
    this.outputChannel.clear();
  }

  /**
   * Disposes of the logger and its output channel.
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}

/**
 * Singleton logger instance for the extension.
 * Use this for consistent logging across all components.
 */
let defaultLogger: Logger | null = null;

/**
 * Gets or creates the default logger instance.
 *
 * @returns The default logger instance
 *
 * @example
 * import { getLogger } from './logger';
 * const logger = getLogger();
 * logger.info('Hello from my component');
 */
export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger('ADK Rust');
  }
  return defaultLogger;
}

/**
 * Disposes of the default logger instance.
 * Call this during extension deactivation.
 */
export function disposeLogger(): void {
  if (defaultLogger) {
    defaultLogger.dispose();
    defaultLogger = null;
  }
}
