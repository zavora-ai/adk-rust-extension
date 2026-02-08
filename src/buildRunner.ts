/**
 * Build Runner for ADK Rust extension.
 * 
 * Executes cargo commands and manages build/run processes.
 * 
 * @module buildRunner
 */

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuration for a build or run operation.
 */
export interface BuildConfig {
  /** Path to the project directory containing Cargo.toml */
  projectPath: string;
  /** Cargo command to execute */
  command: 'build' | 'run' | 'check' | 'test';
  /** Additional arguments to pass to cargo */
  args: string[];
  /** Environment variables to pass to the process */
  env: Record<string, string>;
}

/**
 * Result of a build operation.
 */
export interface BuildResult {
  /** Whether the build succeeded */
  success: boolean;
  /** Exit code of the process */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Parsed diagnostics from cargo output */
  diagnostics: Diagnostic[];
}

/**
 * A diagnostic message from cargo output.
 */
export interface Diagnostic {
  /** Source file path */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  /** Diagnostic message */
  message: string;
  /** Error code (e.g., E0308) */
  code: string | null;
}

/**
 * Constructed cargo command with all arguments.
 */
export interface CargoCommand {
  /** The cargo binary path or 'cargo' */
  binary: string;
  /** Command arguments including subcommand */
  args: string[];
  /** Working directory */
  cwd: string;
  /** Environment variables */
  env: Record<string, string>;
}

/**
 * Options for constructing a cargo command.
 */
export interface CargoCommandOptions {
  /** Custom path to cargo binary */
  cargoPath?: string;
}

/**
 * Constructs a cargo command from a build configuration.
 * 
 * This function builds the complete command line arguments for cargo,
 * including the subcommand, manifest path, and any additional arguments.
 * 
 * @param config - Build configuration
 * @param options - Optional cargo command options
 * @returns Constructed cargo command ready for execution
 * 
 * @example
 * const cmd = constructCargoCommand({
 *   projectPath: '/path/to/project',
 *   command: 'build',
 *   args: ['--release'],
 *   env: { RUST_BACKTRACE: '1' }
 * });
 * // cmd.binary = 'cargo'
 * // cmd.args = ['build', '--manifest-path', '/path/to/project/Cargo.toml', '--release']
 */
export function constructCargoCommand(
  config: BuildConfig,
  options: CargoCommandOptions = {}
): CargoCommand {
  const binary = options.cargoPath || 'cargo';
  
  // Build the arguments array
  const args: string[] = [config.command];
  
  // Add manifest path to ensure cargo runs in the correct project
  const manifestPath = path.join(config.projectPath, 'Cargo.toml');
  args.push('--manifest-path', manifestPath);
  
  // Add any additional arguments
  if (config.args && config.args.length > 0) {
    args.push(...config.args);
  }
  
  // Merge environment variables with process.env
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...config.env
  };
  
  return {
    binary,
    args,
    cwd: config.projectPath,
    env
  };
}

/**
 * Validates a build configuration.
 * 
 * @param config - Build configuration to validate
 * @returns Array of validation error messages, empty if valid
 */
export function validateBuildConfig(config: BuildConfig): string[] {
  const errors: string[] = [];
  
  if (!config.projectPath || config.projectPath.trim() === '') {
    errors.push('Project path is required');
  }
  
  const validCommands = ['build', 'run', 'check', 'test'];
  if (!validCommands.includes(config.command)) {
    errors.push(`Invalid command: ${config.command}. Must be one of: ${validCommands.join(', ')}`);
  }
  
  if (!Array.isArray(config.args)) {
    errors.push('Args must be an array');
  }
  
  if (typeof config.env !== 'object' || config.env === null) {
    errors.push('Env must be an object');
  }
  
  return errors;
}

/**
 * Parses cargo error output to extract diagnostics.
 * 
 * @param output - Raw cargo stderr output
 * @returns Array of parsed diagnostics
 */
export function parseCargoOutput(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  
  // Cargo error format: error[E0308]: mismatched types
  //   --> src/main.rs:10:5
  // Or: warning: unused variable
  //   --> src/lib.rs:5:9
  
  const lines = output.split('\n');
  let currentDiagnostic: Partial<Diagnostic> | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match error/warning header: error[E0308]: message or warning: message
    const headerMatch = line.match(/^(error|warning)(?:\[([A-Z]\d+)\])?: (.+)$/);
    if (headerMatch) {
      // Save previous diagnostic if exists
      if (currentDiagnostic && currentDiagnostic.file) {
        diagnostics.push(currentDiagnostic as Diagnostic);
      }
      
      currentDiagnostic = {
        severity: headerMatch[1] as 'error' | 'warning',
        code: headerMatch[2] || null,
        message: headerMatch[3],
        file: '',
        line: 0,
        column: 0
      };
      continue;
    }
    
    // Match location: --> src/main.rs:10:5
    const locationMatch = line.match(/^\s*-->\s+(.+):(\d+):(\d+)$/);
    if (locationMatch && currentDiagnostic) {
      currentDiagnostic.file = locationMatch[1];
      currentDiagnostic.line = parseInt(locationMatch[2], 10);
      currentDiagnostic.column = parseInt(locationMatch[3], 10);
    }
  }
  
  // Don't forget the last diagnostic
  if (currentDiagnostic && currentDiagnostic.file) {
    diagnostics.push(currentDiagnostic as Diagnostic);
  }
  
  return diagnostics;
}

/**
 * Parses a .env file content and returns key-value pairs.
 * 
 * @param content - Content of the .env file
 * @returns Record of environment variable key-value pairs
 */
export function loadEnvContent(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Only trim for checking empty lines and comments
    const trimmedForCheck = line.trim();
    
    // Skip empty lines and comments
    if (trimmedForCheck === '' || trimmedForCheck.startsWith('#')) {
      continue;
    }
    
    // Match KEY=VALUE pattern on the original line (not trimmed)
    // This preserves whitespace in values
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (match) {
      const [, key, rawValue] = match;
      // Strip surrounding quotes if present (must have at least 2 chars for valid quotes)
      let value = rawValue;
      if (value.length >= 2) {
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
      }
      env[key] = value;
    }
  }
  
  return env;
}

// Build runner state
let currentProcess: ChildProcess | null = null;

/**
 * Executes a cargo build command.
 * 
 * @param config - Build configuration
 * @param options - Optional cargo command options
 * @returns Promise resolving to build result
 */
export async function build(
  config: BuildConfig,
  options: CargoCommandOptions = {}
): Promise<BuildResult> {
  const errors = validateBuildConfig(config);
  if (errors.length > 0) {
    return {
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: errors.join('\n'),
      diagnostics: []
    };
  }
  
  const cmd = constructCargoCommand(config, options);
  
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    
    const spawnOptions: SpawnOptions = {
      cwd: cmd.cwd,
      env: cmd.env,
      shell: false
    };
    
    const proc = spawn(cmd.binary, cmd.args, spawnOptions);
    currentProcess = proc;
    
    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code: number | null) => {
      currentProcess = null;
      const exitCode = code ?? -1;
      const diagnostics = parseCargoOutput(stderr);
      
      resolve({
        success: exitCode === 0,
        exitCode,
        stdout,
        stderr,
        diagnostics
      });
    });
    
    proc.on('error', (err: Error) => {
      currentProcess = null;
      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr: err.message,
        diagnostics: []
      });
    });
  });
}

/**
 * Executes a cargo run command and returns the child process.
 * 
 * Unlike build(), this function returns the ChildProcess immediately,
 * allowing the caller to stream output and manage the process lifecycle.
 * The process environment is automatically loaded from .env file if present.
 * 
 * @param config - Build configuration (command will be overridden to 'run')
 * @param options - Optional cargo command options
 * @returns The spawned child process
 * 
 * @example
 * const proc = run({
 *   projectPath: '/path/to/project',
 *   command: 'run',
 *   args: [],
 *   env: {}
 * });
 * 
 * proc.stdout?.on('data', (data) => console.log(data.toString()));
 * proc.on('close', (code) => console.log(`Process exited with code ${code}`));
 */
export function run(
  config: BuildConfig,
  options: CargoCommandOptions = {}
): ChildProcess {
  // Validate config
  const errors = validateBuildConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid build configuration: ${errors.join(', ')}`);
  }
  
  // Load environment variables from .env file if present
  const envFromFile = loadEnvFile(config.projectPath);
  
  // Create a modified config with 'run' command and merged env
  const runConfig: BuildConfig = {
    ...config,
    command: 'run',
    env: {
      ...envFromFile,
      ...config.env
    }
  };
  
  const cmd = constructCargoCommand(runConfig, options);
  
  const spawnOptions: SpawnOptions = {
    cwd: cmd.cwd,
    env: cmd.env,
    shell: false
  };
  
  const proc = spawn(cmd.binary, cmd.args, spawnOptions);
  currentProcess = proc;
  
  // Clean up currentProcess reference when process exits
  proc.on('close', () => {
    if (currentProcess === proc) {
      currentProcess = null;
    }
  });
  
  proc.on('error', () => {
    if (currentProcess === proc) {
      currentProcess = null;
    }
  });
  
  return proc;
}

/**
 * Loads environment variables from a .env file in the project directory.
 * 
 * @param projectPath - Path to the project directory
 * @returns Record of environment variable key-value pairs, empty if file doesn't exist
 * 
 * @example
 * const env = loadEnvFile('/path/to/project');
 * // env = { GOOGLE_API_KEY: 'xxx', DATABASE_URL: 'postgres://...' }
 */
export function loadEnvFile(projectPath: string): Record<string, string> {
  const envPath = path.join(projectPath, '.env');
  
  try {
    if (!fs.existsSync(envPath)) {
      return {};
    }
    
    const content = fs.readFileSync(envPath, 'utf-8');
    return loadEnvContent(content);
  } catch {
    // If we can't read the file, return empty object
    return {};
  }
}

/**
 * Cancels the currently running build process.
 */
export function cancel(): void {
  if (currentProcess) {
    currentProcess.kill('SIGTERM');
    currentProcess = null;
  }
}

/**
 * Checks if a build is currently running.
 */
export function isRunning(): boolean {
  return currentProcess !== null;
}
