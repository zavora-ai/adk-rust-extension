/**
 * Project Scaffolder for ADK-Rust projects.
 * Generates complete project structures from templates.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TemplateType } from './configManager';
import { TemplateContent, TemplateMetadata } from './templates/types';
import * as simpleChat from './templates/simple-chat';
import * as toolUsingAgent from './templates/tool-using-agent';
import * as multiAgentWorkflow from './templates/multi-agent-workflow';
import * as graphWorkflow from './templates/graph-workflow';

/**
 * Configuration for creating a new project.
 */
export interface ProjectConfig {
  /** Project name (used in Cargo.toml and directory name) */
  name: string;
  /** Template type to use */
  template: TemplateType;
  /** Target directory where project will be created */
  targetDir: string;
  /** ADK version to use (for future compatibility) */
  adkVersion: string;
}

/**
 * Represents a file to be created in the project.
 */
export interface TemplateFile {
  /** Relative path within the project */
  path: string;
  /** File content */
  content: string;
}

/**
 * Safe project name pattern: starts with letter, alphanumeric/underscore/hyphen only.
 */
const SAFE_PROJECT_NAME = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

/**
 * Template metadata for all available templates.
 */
const TEMPLATE_METADATA: Record<TemplateType, TemplateMetadata> = {
  'simple-chat': {
    id: 'simple-chat',
    name: 'Simple Chat Agent',
    description: 'Basic conversational agent with LLM integration',
    requiredApiKeys: simpleChat.REQUIRED_API_KEYS,
    adkCrates: simpleChat.ADK_CRATES,
  },
  'tool-using-agent': {
    id: 'tool-using-agent',
    name: 'Tool-Using Agent',
    description: 'Agent with function tools and Google Search',
    requiredApiKeys: toolUsingAgent.REQUIRED_API_KEYS,
    adkCrates: toolUsingAgent.ADK_CRATES,
  },
  'multi-agent-workflow': {
    id: 'multi-agent-workflow',
    name: 'Multi-Agent Workflow',
    description: 'Sequential and parallel agent orchestration',
    requiredApiKeys: multiAgentWorkflow.REQUIRED_API_KEYS,
    adkCrates: multiAgentWorkflow.ADK_CRATES,
  },
  'graph-workflow': {
    id: 'graph-workflow',
    name: 'Graph Workflow',
    description: 'LangGraph-style workflow with state management',
    requiredApiKeys: graphWorkflow.REQUIRED_API_KEYS,
    adkCrates: graphWorkflow.ADK_CRATES,
  },
};

/**
 * Gets all available template types.
 *
 * @returns Array of template type identifiers
 *
 * @example
 * const templates = getTemplates();
 * // Returns: ['simple-chat', 'tool-using-agent', 'multi-agent-workflow', 'graph-workflow']
 */
export function getTemplates(): TemplateType[] {
  return ['simple-chat', 'tool-using-agent', 'multi-agent-workflow', 'graph-workflow'];
}

/**
 * Gets the description for a template type.
 *
 * @param template - Template type identifier
 * @returns Human-readable description of the template
 *
 * @example
 * const desc = getTemplateDescription('simple-chat');
 * // Returns: 'Basic conversational agent with LLM integration'
 */
export function getTemplateDescription(template: TemplateType): string {
  return TEMPLATE_METADATA[template].description;
}

/**
 * Gets metadata for a template type.
 *
 * @param template - Template type identifier
 * @returns Template metadata including name, description, and requirements
 */
export function getTemplateMetadata(template: TemplateType): TemplateMetadata {
  return TEMPLATE_METADATA[template];
}

/**
 * Gets the required API keys for a template.
 *
 * @param template - Template type identifier
 * @returns Array of required API key environment variable names
 */
export function getRequiredApiKeys(template: TemplateType): string[] {
  return TEMPLATE_METADATA[template].requiredApiKeys;
}

/**
 * Validates a project name for safety and correctness.
 *
 * @param name - Project name to validate
 * @returns Sanitized project name
 * @throws Error if name is invalid
 */
export function sanitizeProjectName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Project name is required');
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    throw new Error('Project name cannot be empty');
  }

  if (trimmed.length > 64) {
    throw new Error('Project name too long (max 64 characters)');
  }

  if (!/^[a-zA-Z]/.test(trimmed)) {
    throw new Error('Project name must start with a letter');
  }

  if (!SAFE_PROJECT_NAME.test(trimmed)) {
    throw new Error('Project name can only contain letters, numbers, underscores, and hyphens');
  }

  return trimmed;
}

/**
 * Generates Cargo.toml content for a project.
 *
 * @param config - Project configuration
 * @returns Cargo.toml file content
 *
 * @example
 * const toml = generateCargoToml({ name: 'my-agent', template: 'simple-chat', ... });
 */
export function generateCargoToml(config: ProjectConfig): string {
  const { name, template } = config;

  switch (template) {
    case 'simple-chat':
      return simpleChat.generateCargoToml(name);
    case 'tool-using-agent':
      return toolUsingAgent.generateCargoToml(name);
    case 'multi-agent-workflow':
      return multiAgentWorkflow.generateCargoToml(name);
    case 'graph-workflow':
      return graphWorkflow.generateCargoToml(name);
    default:
      // Fallback to simple-chat for unknown templates
      return simpleChat.generateCargoToml(name);
  }
}

/**
 * Generates main.rs content for a project.
 *
 * @param template - Template type
 * @param projectName - Project name
 * @returns main.rs file content
 *
 * @example
 * const mainRs = generateMainRs('simple-chat', 'my-agent');
 */
export function generateMainRs(template: TemplateType, projectName: string): string {
  switch (template) {
    case 'simple-chat':
      return simpleChat.generateMainRs(projectName);
    case 'tool-using-agent':
      return toolUsingAgent.generateMainRs(projectName);
    case 'multi-agent-workflow':
      return multiAgentWorkflow.generateMainRs(projectName);
    case 'graph-workflow':
      return graphWorkflow.generateMainRs(projectName);
    default:
      return simpleChat.generateMainRs(projectName);
  }
}

/**
 * Generates .env.example content for a project.
 *
 * @param template - Template type
 * @returns .env.example file content
 *
 * @example
 * const envExample = generateEnvExample('tool-using-agent');
 */
export function generateEnvExample(template: TemplateType): string {
  switch (template) {
    case 'simple-chat':
      return simpleChat.generateEnvExample();
    case 'tool-using-agent':
      return toolUsingAgent.generateEnvExample();
    case 'multi-agent-workflow':
      return multiAgentWorkflow.generateEnvExample();
    case 'graph-workflow':
      return graphWorkflow.generateEnvExample();
    default:
      return simpleChat.generateEnvExample();
  }
}

/**
 * Generates README.md content for a project.
 *
 * @param config - Project configuration
 * @returns README.md file content
 *
 * @example
 * const readme = generateReadme({ name: 'my-agent', template: 'simple-chat', ... });
 */
export function generateReadme(config: ProjectConfig): string {
  const { name, template } = config;

  switch (template) {
    case 'simple-chat':
      return simpleChat.generateReadme(name);
    case 'tool-using-agent':
      return toolUsingAgent.generateReadme(name);
    case 'multi-agent-workflow':
      return multiAgentWorkflow.generateReadme(name);
    case 'graph-workflow':
      return graphWorkflow.generateReadme(name);
    default:
      return simpleChat.generateReadme(name);
  }
}

/**
 * Gets all template content for a project configuration.
 *
 * @param config - Project configuration
 * @returns Template content with all generated files
 */
export function getTemplateContent(config: ProjectConfig): TemplateContent {
  const { name, template } = config;

  switch (template) {
    case 'simple-chat':
      return simpleChat.getTemplateContent(name);
    case 'tool-using-agent':
      return toolUsingAgent.getTemplateContent(name);
    case 'multi-agent-workflow':
      return multiAgentWorkflow.getTemplateContent(name);
    case 'graph-workflow':
      return graphWorkflow.getTemplateContent(name);
    default:
      return simpleChat.getTemplateContent(name);
  }
}

/**
 * Gets all files to be created for a project.
 *
 * @param config - Project configuration
 * @returns Array of template files with paths and content
 */
export function getProjectFiles(config: ProjectConfig): TemplateFile[] {
  const content = getTemplateContent(config);

  return [
    { path: 'Cargo.toml', content: content.cargoToml },
    { path: 'src/main.rs', content: content.mainRs },
    { path: '.env.example', content: content.envExample },
    { path: 'README.md', content: content.readme },
    { path: '.gitignore', content: generateGitignore() },
  ];
}

/**
 * Generates .gitignore content for Rust projects.
 */
function generateGitignore(): string {
  return `/target
.env
*.log
.DS_Store
`;
}

/**
 * Validates that a path is within the target directory (prevents path traversal).
 *
 * @param filePath - File path to validate
 * @param targetDir - Target directory root
 * @returns Absolute path if valid
 * @throws Error if path escapes target directory
 */
function validatePath(filePath: string, targetDir: string): string {
  const normalized = path.normalize(filePath);
  const absolute = path.resolve(targetDir, normalized);

  const resolvedTarget = path.resolve(targetDir);
  if (absolute !== resolvedTarget && !absolute.startsWith(resolvedTarget + path.sep)) {
    throw new Error(`Path escapes target directory: ${filePath}`);
  }

  if (absolute.includes('\0')) {
    throw new Error('Invalid path: contains null byte');
  }

  return absolute;
}

/**
 * Creates a new ADK-Rust project from a template.
 *
 * @param config - Project configuration
 * @returns Promise that resolves when project is created
 * @throws Error if project creation fails
 *
 * @example
 * await createProject({
 *   name: 'my-agent',
 *   template: 'simple-chat',
 *   targetDir: '/path/to/projects',
 *   adkVersion: '0.1',
 * });
 */
export async function createProject(config: ProjectConfig): Promise<void> {
  // Validate project name
  const sanitizedName = sanitizeProjectName(config.name);
  const safeConfig = { ...config, name: sanitizedName };

  // Create project directory
  const projectDir = path.join(config.targetDir, sanitizedName);

  // Check if directory already exists
  if (fs.existsSync(projectDir)) {
    throw new Error(`Directory already exists: ${projectDir}`);
  }

  // Get all files to create
  const files = getProjectFiles(safeConfig);

  // Create project directory
  fs.mkdirSync(projectDir, { recursive: true });

  // Create src directory
  const srcDir = path.join(projectDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  // Write all files
  for (const file of files) {
    const filePath = validatePath(file.path, projectDir);
    const fileDir = path.dirname(filePath);

    // Ensure directory exists
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    fs.writeFileSync(filePath, file.content, 'utf-8');
  }
}

/**
 * Checks if a directory exists and contains files.
 *
 * @param dirPath - Directory path to check
 * @returns True if directory exists and is not empty
 */
export function directoryExists(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}
