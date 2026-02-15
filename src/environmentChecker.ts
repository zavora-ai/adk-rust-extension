import { spawn } from 'child_process';
import * as fs from 'fs';

/**
 * Status of a tool in the development environment.
 */
export interface ToolStatus {
  /** Whether the tool is available and executable */
  available: boolean;
  /** Path to the tool binary, or null if not found */
  path: string | null;
  /** Version string of the tool, or null if not found */
  version: string | null;
  /** Error message if tool check failed, or null if successful */
  error: string | null;
}

/**
 * Status of an API key in the environment.
 */
export interface ApiKeyStatus {
  /** Human-readable name of the API key */
  name: string;
  /** Environment variable name */
  envVar: string;
  /** Whether the key is present (non-empty) */
  present: boolean;
}

/**
 * Complete environment status for ADK development.
 */
export interface EnvironmentStatus {
  rustc: ToolStatus;
  cargo: ToolStatus;
  adkStudio: ToolStatus;
  apiKeys: ApiKeyStatus[];
}

/**
 * Options for checking a tool.
 */
export interface CheckToolOptions {
  /** Custom path to the binary, overrides PATH lookup */
  customPath?: string | null;
  /** Custom PATH environment variable for lookup */
  pathEnv?: string;
  /** Timeout in milliseconds for version check */
  timeout?: number;
}

/**
 * Checks if a tool is available in PATH or at a custom location.
 * 
 * @param name - Human-readable tool name for error messages
 * @param command - Command to execute (e.g., 'rustc', 'cargo')
 * @param options - Optional configuration for the check
 * @returns Tool status with availability, path, and version
 * 
 * @example
 * const status = await checkTool('Rust compiler', 'rustc');
 * if (!status.available) {
 *   showInstallationGuide('rustc');
 * }
 */
export async function checkTool(
  name: string,
  command: string,
  options: CheckToolOptions = {}
): Promise<ToolStatus> {
  const { customPath, pathEnv, timeout = 5000 } = options;
  
  // Determine the actual command to run
  const actualCommand = customPath || command;
  
  try {
    const result = await executeVersionCheck(actualCommand, pathEnv, timeout);
    
    if (result.success) {
      return {
        available: true,
        path: result.path,
        version: result.version,
        error: null,
      };
    } else {
      return {
        available: false,
        path: null,
        version: null,
        error: result.error || `${name} not found`,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      path: null,
      version: null,
      error: `Failed to check ${name}: ${message}`,
    };
  }
}

interface VersionCheckResult {
  success: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
}

/**
 * Executes a version check command and parses the output.
 */
async function executeVersionCheck(
  command: string,
  pathEnv: string | undefined,
  timeout: number
): Promise<VersionCheckResult> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (pathEnv !== undefined) {
      env.PATH = pathEnv;
    }
    
    const proc = spawn(command, ['--version'], {
      shell: false,
      env,
      timeout,
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    proc.on('error', (err: Error) => {
      resolve({
        success: false,
        path: null,
        version: null,
        error: err.message,
      });
    });
    
    proc.on('close', (code: number | null) => {
      if (code === 0) {
        const version = parseVersion(stdout || stderr);
        resolve({
          success: true,
          path: command,
          version,
          error: null,
        });
      } else {
        resolve({
          success: false,
          path: null,
          version: null,
          error: stderr || `Command exited with code ${code}`,
        });
      }
    });
  });
}

/**
 * Parses version string from command output.
 */
function parseVersion(output: string): string | null {
  // Common version patterns
  const patterns = [
    /(\d+\.\d+\.\d+)/,           // semver: 1.2.3
    /(\d+\.\d+)/,                 // major.minor: 1.2
    /version\s+(\S+)/i,           // "version X.Y.Z"
  ];
  
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  // Return first line if no version pattern found
  const firstLine = output.trim().split('\n')[0];
  return firstLine || null;
}

/**
 * Default API keys to check in project .env files.
 */
export const DEFAULT_API_KEYS = ['GOOGLE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];

/**
 * Checks the complete development environment.
 * 
 * @param customPaths - Optional custom paths for tools and project .env file
 * @returns Complete environment status
 * 
 * @example
 * const status = await checkEnvironment({
 *   envFilePath: path.join(projectPath, '.env'),
 * });
 * if (status.apiKeys.some(k => !k.present)) {
 *   showMissingKeysWarning(status.apiKeys);
 * }
 */
export async function checkEnvironment(customPaths?: {
  rustcPath?: string | null;
  cargoPath?: string | null;
  adkStudioPath?: string | null;
  envFilePath?: string | null;
}): Promise<EnvironmentStatus> {
  const [rustc, cargo, adkStudio] = await Promise.all([
    checkTool('Rust compiler', 'rustc', { customPath: customPaths?.rustcPath }),
    checkTool('Cargo', 'cargo', { customPath: customPaths?.cargoPath }),
    checkTool('ADK Studio', 'adk-studio', { customPath: customPaths?.adkStudioPath }),
  ]);

  let apiKeys: ApiKeyStatus[] = [];
  if (customPaths?.envFilePath) {
    try {
      const content = await fs.promises.readFile(customPaths.envFilePath, 'utf-8');
      apiKeys = checkApiKeys(content, DEFAULT_API_KEYS);
    } catch {
      // .env file doesn't exist — all keys missing
      apiKeys = DEFAULT_API_KEYS.map(envVar => ({
        name: envVar.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' '),
        envVar,
        present: false,
      }));
    }
  }

  return { rustc, cargo, adkStudio, apiKeys };
}

/**
 * Gets installation guide for a missing tool.
 * 
 * @param tool - Tool identifier ('rustc', 'cargo', 'adk-studio')
 * @returns Installation guide text
 */
export function getInstallationGuide(tool: string): string {
  switch (tool) {
    case 'rustc':
    case 'cargo':
      return 'Install Rust using rustup: https://rustup.rs\n\nRun: curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh';
    case 'adk-studio':
      return [
        '# ADK Studio Installation',
        '',
        'ADK Studio is the visual builder for ADK Rust agents.',
        '',
        '## Install via Cargo',
        '',
        '```sh',
        'cargo install adk-studio',
        '```',
        '',
        '## Verify Installation',
        '',
        '```sh',
        'adk-studio --version',
        '```',
        '',
        'After installing, restart the environment check or reopen VS Code.',
      ].join('\n');
    default:
      return `Please install ${tool} and ensure it is available in your PATH.`;
  }
}

/**
 * Parses .env file content and extracts key-value pairs.
 * Handles comments, empty lines, and quoted values.
 * 
 * @param content - Raw .env file content
 * @returns Record of environment variable names to their values
 * 
 * @example
 * const env = parseEnvContent('API_KEY=secret\n# comment\nOTHER="quoted"');
 * // Returns: { API_KEY: 'secret', OTHER: 'quoted' }
 */
export function parseEnvContent(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  
  if (!content || typeof content !== 'string') {
    return env;
  }
  
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Only trim leading whitespace to preserve value content
    const trimmedStart = line.trimStart();
    
    // Skip empty lines and comments
    if (!trimmedStart || trimmedStart.startsWith('#')) {
      continue;
    }
    
    // Find the first = sign (key cannot contain =, but value can)
    const eqIndex = trimmedStart.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    
    const key = trimmedStart.slice(0, eqIndex).trim();
    let value = trimmedStart.slice(eqIndex + 1);
    
    // Validate key format: must start with letter or underscore, contain only alphanumeric and underscore
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    
    // Strip surrounding quotes if present (both single and double)
    // Only strip if there are at least 2 characters and quotes match
    if (value.length >= 2) {
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
    }
    
    env[key] = value;
  }
  
  return env;
}

/**
 * Checks for the presence of required API keys in .env file content.
 * 
 * @param envContent - Raw .env file content
 * @param requiredKeys - Array of required API key names (environment variable names)
 * @returns Array of ApiKeyStatus indicating which keys are present/missing
 * 
 * @example
 * const status = checkApiKeys('GOOGLE_API_KEY=abc123', ['GOOGLE_API_KEY', 'OTHER_KEY']);
 * // Returns: [
 * //   { name: 'Google API Key', envVar: 'GOOGLE_API_KEY', present: true },
 * //   { name: 'Other Key', envVar: 'OTHER_KEY', present: false }
 * // ]
 */
export function checkApiKeys(
  envContent: string,
  requiredKeys: string[]
): ApiKeyStatus[] {
  const parsedEnv = parseEnvContent(envContent);
  
  return requiredKeys.map(envVar => {
    // Convert ENV_VAR_NAME to "Env Var Name" for display
    const name = envVar
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    // Key is present if it exists and has a non-empty value
    const value = parsedEnv[envVar];
    const present = value !== undefined && value.trim().length > 0;
    
    return {
      name,
      envVar,
      present,
    };
  });
}

/**
 * Updates or adds a key-value pair in .env file content.
 * If the key exists, replaces its value in-place. If not, appends a new line.
 * Ensures no duplicate keys are created.
 * 
 * @param content - Existing .env file content
 * @param key - Environment variable name (e.g., 'GOOGLE_API_KEY')
 * @param value - Value to set
 * @returns Updated .env content string
 * 
 * @example
 * const updated = updateEnvKey('GOOGLE_API_KEY=old', 'GOOGLE_API_KEY', 'new');
 * // Returns: 'GOOGLE_API_KEY=new'
 * 
 * @example
 * const updated = updateEnvKey('OTHER_KEY=val', 'NEW_KEY', 'secret');
 * // Returns: 'OTHER_KEY=val\nNEW_KEY=secret'
 */
export function updateEnvKey(content: string, key: string, value: string): string {
  const lines = content.split('\n');
  const pattern = new RegExp(`^${key}\\s*=`);
  let found = false;

  const updated = lines.map(line => {
    if (pattern.test(line)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    // Ensure there's a newline before appending if content doesn't end with one
    if (updated.length > 0 && updated[updated.length - 1] !== '') {
      updated.push('');
    }
    updated.push(`${key}=${value}`);
  }

  return updated.join('\n');
}
