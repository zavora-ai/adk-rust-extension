/**
 * Project Tree Provider for ADK-Rust projects.
 * Provides a tree view in the Explorer sidebar showing ADK projects and their agents.
 *
 * @module projectTreeProvider
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Agent types supported by ADK-Rust.
 */
export type AgentType = 'llm' | 'sequential' | 'parallel' | 'loop' | 'graph';

/**
 * Information about an agent defined in a project.
 */
export interface AgentInfo {
  /** Agent name extracted from code */
  name: string;
  /** Type of agent (llm, sequential, parallel, loop, graph) */
  type: AgentType;
  /** Path to the file containing the agent definition */
  filePath: string;
  /** Line number where the agent is defined */
  line: number;
}

/**
 * Represents an ADK-Rust project in the workspace.
 */
export interface AdkProject {
  /** Project name from Cargo.toml */
  name: string;
  /** Absolute path to the project directory */
  path: string;
  /** Agents defined in the project */
  agents: AgentInfo[];
}

/**
 * Tree item types for the project tree view.
 */
type TreeItemType = 'project' | 'agent';

/**
 * Tree item representing a project or agent in the tree view.
 */
export class AdkTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: TreeItemType,
    public readonly project?: AdkProject,
    public readonly agent?: AgentInfo
  ) {
    super(label, collapsibleState);

    if (itemType === 'project' && project) {
      this.tooltip = project.path;
      this.contextValue = 'adkProject';
      this.iconPath = new vscode.ThemeIcon('package');
      this.description = `${project.agents.length} agent${project.agents.length !== 1 ? 's' : ''}`;
    } else if (itemType === 'agent' && agent) {
      this.tooltip = `${agent.type} agent at line ${agent.line}`;
      this.contextValue = 'adkAgent';
      this.iconPath = getAgentIcon(agent.type);
      this.description = agent.type;
      this.command = {
        command: 'vscode.open',
        title: 'Open Agent',
        arguments: [
          vscode.Uri.file(agent.filePath),
          { selection: new vscode.Range(agent.line - 1, 0, agent.line - 1, 0) }
        ]
      };
    }
  }
}

/**
 * Gets the appropriate icon for an agent type.
 *
 * @param type - Agent type
 * @returns VS Code theme icon
 */
function getAgentIcon(type: AgentType): vscode.ThemeIcon {
  switch (type) {
    case 'llm':
      return new vscode.ThemeIcon('comment-discussion');
    case 'sequential':
      return new vscode.ThemeIcon('list-ordered');
    case 'parallel':
      return new vscode.ThemeIcon('split-horizontal');
    case 'loop':
      return new vscode.ThemeIcon('sync');
    case 'graph':
      return new vscode.ThemeIcon('type-hierarchy');
    default:
      return new vscode.ThemeIcon('symbol-method');
  }
}

/**
 * Known ADK crate names from the adk-rust workspace.
 * Used for precise project detection — avoids false positives from
 * unrelated crates that happen to start with `adk-`.
 */
export const ADK_CRATE_NAMES = [
  'adk-rust', 'adk-core', 'adk-agent', 'adk-model', 'adk-tool',
  'adk-runner', 'adk-server', 'adk-session', 'adk-artifact', 'adk-memory',
  'adk-cli', 'adk-realtime', 'adk-graph', 'adk-browser', 'adk-eval',
  'adk-ui', 'adk-spatial-os', 'adk-telemetry', 'adk-guardrail', 'adk-auth',
  'adk-plugin', 'adk-skill', 'adk-studio', 'adk-gemini', 'adk-doc-audit',
];

/**
 * Checks if a Cargo.toml file indicates an ADK project by looking for
 * dependencies on any known ADK crate.
 *
 * @param cargoTomlContent - Content of the Cargo.toml file
 * @returns True if the project has ADK dependencies
 *
 * @example
 * isAdkProject('[dependencies]\nadk-rust = "0.2"'); // true
 * isAdkProject('[dependencies]\ntokio = "1"');       // false
 */
export function isAdkProject(cargoTomlContent: string): boolean {
  return ADK_CRATE_NAMES.some(crate => {
    // Match crate name at line start (possibly indented) followed by = or whitespace.
    // Allow both - and _ since Cargo normalizes hyphens to underscores.
    const pattern = new RegExp(`(?:^|\\n)\\s*${crate.replace(/-/g, '[-_]')}\\s*=`, 'm');
    return pattern.test(cargoTomlContent);
  });
}

/**
 * Parses the project name from Cargo.toml content.
 *
 * @param cargoTomlContent - Content of the Cargo.toml file
 * @returns Project name or null if not found
 */
export function parseProjectName(cargoTomlContent: string): string | null {
  const nameMatch = cargoTomlContent.match(/^\s*name\s*=\s*"([^"]+)"/m);
  return nameMatch ? nameMatch[1] : null;
}

/**
 * Determines the agent type from code patterns.
 *
 * @param codeContext - Code surrounding the agent definition
 * @returns Detected agent type
 */
export function detectAgentType(codeContext: string): AgentType {
  const lowerContext = codeContext.toLowerCase();

  // Check more specific patterns first
  if (lowerContext.includes('sequential') || lowerContext.includes('sequence')) {
    return 'sequential';
  }
  if (lowerContext.includes('parallel')) {
    return 'parallel';
  }
  if (lowerContext.includes('loop') || lowerContext.includes('while')) {
    return 'loop';
  }
  // Check graph/workflow last as it's more general
  if (lowerContext.includes('graph') || lowerContext.includes('workflow')) {
    return 'graph';
  }
  return 'llm';
}

/**
 * Parses agent definitions from a Rust source file.
 *
 * @param filePath - Path to the Rust source file
 * @param content - File content
 * @returns Array of agent information
 */
export function parseAgentsFromContent(filePath: string, content: string): AgentInfo[] {
  const agents: AgentInfo[] = [];
  const lines = content.split('\n');

  // Pattern to match Agent::builder() or similar agent creation patterns
  const agentBuilderPattern = /Agent::builder\s*\(\s*\)/;
  // Pattern to match let binding with agent name
  const letBindingPattern = /let\s+(?:mut\s+)?(\w+)\s*=\s*Agent::builder/;
  // Pattern to match agent name in .name() call
  const nameMethodPattern = /\.name\s*\(\s*"([^"]+)"\s*\)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Check for Agent::builder pattern
    if (agentBuilderPattern.test(line)) {
      // Try to extract agent name from let binding
      const letMatch = line.match(letBindingPattern);
      let agentName = letMatch ? letMatch[1] : 'unnamed_agent';

      // Look for .name() call in surrounding lines (up to 10 lines ahead)
      const contextLines = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
      const nameMatch = contextLines.match(nameMethodPattern);
      if (nameMatch) {
        agentName = nameMatch[1];
      }

      // Detect agent type from context
      const contextForType = lines.slice(Math.max(0, i - 5), Math.min(i + 15, lines.length)).join('\n');
      const agentType = detectAgentType(contextForType);

      agents.push({
        name: agentName,
        type: agentType,
        filePath,
        line: lineNumber
      });
    }
  }

  return agents;
}

/**
 * Parses agent definitions from a Rust source file.
 *
 * @param filePath - Path to the Rust source file
 * @returns Promise resolving to array of agent information
 */
export async function parseAgentsFromFile(filePath: string): Promise<AgentInfo[]> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return parseAgentsFromContent(filePath, content);
  } catch {
    return [];
  }
}

/**
 * Tree data provider for ADK projects in the workspace.
 * Implements VS Code's TreeDataProvider interface.
 *
 * @example
 * const provider = new ProjectTreeProvider();
 * vscode.window.registerTreeDataProvider('adkProjects', provider);
 */
export class ProjectTreeProvider implements vscode.TreeDataProvider<AdkTreeItem>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<AdkTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private projects: AdkProject[] = [];
  private readonly fileWatcher: vscode.FileSystemWatcher | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    // Watch for Cargo.toml changes to detect new/removed projects
    this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/Cargo.toml');

    this.fileWatcher.onDidCreate(() => this.refresh());
    this.fileWatcher.onDidDelete(() => this.refresh());
    this.fileWatcher.onDidChange(() => this.refresh());

    this.disposables.push(this.fileWatcher);

    // Also watch for .rs file changes to update agent list
    const rsWatcher = vscode.workspace.createFileSystemWatcher('**/*.rs');
    rsWatcher.onDidChange(() => this.refresh());
    rsWatcher.onDidCreate(() => this.refresh());
    rsWatcher.onDidDelete(() => this.refresh());
    this.disposables.push(rsWatcher);

    // Initial scan
    this.refresh();
  }

  /**
   * Refreshes the tree view by rescanning the workspace.
   */
  async refresh(): Promise<void> {
    this.projects = await this.detectProjects();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item for display.
   *
   * @param element - Tree item element
   * @returns Tree item for VS Code
   */
  getTreeItem(element: AdkTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Gets children of a tree item.
   *
   * @param element - Parent element, or undefined for root
   * @returns Array of child tree items
   */
  async getChildren(element?: AdkTreeItem): Promise<AdkTreeItem[]> {
    if (!element) {
      // Root level - return projects
      return this.projects.map(project =>
        new AdkTreeItem(
          project.name,
          project.agents.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None,
          'project',
          project
        )
      );
    }

    if (element.itemType === 'project' && element.project) {
      // Project level - return agents
      return element.project.agents.map(agent =>
        new AdkTreeItem(
          agent.name,
          vscode.TreeItemCollapsibleState.None,
          'agent',
          undefined,
          agent
        )
      );
    }

    return [];
  }

  /**
   * Detects ADK projects in the workspace.
   *
   * @returns Promise resolving to array of detected projects
   */
  async detectProjects(): Promise<AdkProject[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return [];
    }

    const projects: AdkProject[] = [];

    for (const folder of workspaceFolders) {
      const foundProjects = await this.scanFolderForProjects(folder.uri.fsPath);
      projects.push(...foundProjects);
    }

    return projects;
  }

  /**
   * Scans a folder recursively for ADK projects.
   *
   * @param folderPath - Path to scan
   * @param maxDepth - Maximum recursion depth
   * @returns Promise resolving to array of detected projects
   */
  private async scanFolderForProjects(folderPath: string, maxDepth: number = 5): Promise<AdkProject[]> {
    const projects: AdkProject[] = [];

    if (maxDepth <= 0) {
      return projects;
    }

    try {
      const cargoTomlPath = path.join(folderPath, 'Cargo.toml');

      if (fs.existsSync(cargoTomlPath)) {
        const cargoContent = await fs.promises.readFile(cargoTomlPath, 'utf-8');

        if (isAdkProject(cargoContent)) {
          const projectName = parseProjectName(cargoContent) || path.basename(folderPath);
          const agents = await this.scanProjectForAgents(folderPath);

          projects.push({
            name: projectName,
            path: folderPath,
            agents
          });

          // Don't recurse into project directories
          return projects;
        }
      }

      // Scan subdirectories
      const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'target') {
          const subProjects = await this.scanFolderForProjects(
            path.join(folderPath, entry.name),
            maxDepth - 1
          );
          projects.push(...subProjects);
        }
      }
    } catch {
      // Ignore errors (permission denied, etc.)
    }

    return projects;
  }

  /**
   * Scans a project directory for agent definitions.
   *
   * @param projectPath - Path to the project
   * @returns Promise resolving to array of agent information
   */
  private async scanProjectForAgents(projectPath: string): Promise<AgentInfo[]> {
    const agents: AgentInfo[] = [];
    const srcPath = path.join(projectPath, 'src');

    if (!fs.existsSync(srcPath)) {
      return agents;
    }

    try {
      const rsFiles = await this.findRustFiles(srcPath);

      for (const rsFile of rsFiles) {
        const fileAgents = await parseAgentsFromFile(rsFile);
        agents.push(...fileAgents);
      }
    } catch {
      // Ignore errors
    }

    return agents;
  }

  /**
   * Finds all Rust source files in a directory recursively.
   *
   * @param dirPath - Directory to search
   * @returns Promise resolving to array of file paths
   */
  private async findRustFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.findRustFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.rs')) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore errors
    }

    return files;
  }

  /**
   * Gets the currently detected projects.
   *
   * @returns Array of detected ADK projects
   */
  getProjects(): AdkProject[] {
    return [...this.projects];
  }

  /**
   * Disposes of resources.
   */
  dispose(): void {
    this._onDidChangeTreeData.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
