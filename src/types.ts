/**
 * Shared type definitions for the Studio-First UX.
 *
 * These interfaces define the data models used across the sidebar webview,
 * Studio webview, MessageBus, and extension host.
 *
 * @module types
 */

import type { AgentType } from './projectTreeProvider';

/**
 * Represents the current execution status of an ADK project.
 *
 * - `'stopped'` — the project is idle
 * - `'running'` — the project is executing via `cargo run`
 * - `'building'` — the project is compiling via `cargo build`
 */
export type ProjectStatus = 'stopped' | 'running' | 'building';

/**
 * Data model for rendering a project card in the sidebar webview.
 *
 * Each card maps one-to-one with a detected ADK project in the workspace.
 */
export interface ProjectCardData {
  /** Unique project identifier (absolute path). */
  id: string;
  /** Project name from Cargo.toml. */
  name: string;
  /** Template type if detectable, or null. */
  templateType: string | null;
  /** Current project status. */
  status: ProjectStatus;
  /** Agents discovered in this project. */
  agents: AgentCardData[];
  /** Whether the "Open in Studio" action is available. */
  studioAvailable: boolean;
}

/**
 * Data model for rendering an agent card inside a project card.
 */
export interface AgentCardData {
  /** Agent name. */
  name: string;
  /** Agent type used for icon selection. */
  type: AgentType;
  /** Absolute file path for click-to-navigate. */
  filePath: string;
  /** Line number in the source file where the agent is defined. */
  line: number;
}

/**
 * Data model for the environment health badge in the sidebar.
 *
 * Summarises tool availability, API key configuration, and Studio status.
 */
export interface EnvironmentBadgeData {
  /** Overall environment health. */
  health: 'ok' | 'warning' | 'error';
  /** Individual tool statuses. */
  tools: {
    /** Human-readable tool name (e.g. "rustc", "cargo"). */
    name: string;
    /** Whether the tool was found on PATH or at a custom location. */
    available: boolean;
    /** Detected version string, or null if unavailable. */
    version: string | null;
  }[];
  /** API key configuration summary. */
  apiKeys: {
    /** Number of API keys that are configured. */
    configured: number;
    /** Total number of API keys checked. */
    total: number;
  };
  /** Whether the adk-studio binary is available. */
  studioAvailable: boolean;
}

/**
 * Messages sent from the sidebar webview to the extension host.
 *
 * Each variant represents a user action in the sidebar UI.
 */
export type SidebarMessage =
  | { type: 'runProject'; projectId: string }
  | { type: 'buildProject'; projectId: string }
  | { type: 'openInStudio'; projectId: string }
  | { type: 'openSource'; projectId: string }
  | { type: 'openAgent'; filePath: string; line: number }
  | { type: 'createProject'; name: string; template: string }
  | { type: 'openInstallGuide' }
  | { type: 'refreshProjects' }
  | { type: 'ready' };

/**
 * Messages sent from the extension host to the sidebar webview.
 *
 * Each variant represents a state update or response pushed to the UI.
 */
export type ExtensionToSidebarMessage =
  | { type: 'updateProjects'; projects: ProjectCardData[] }
  | { type: 'updateEnvironment'; environment: EnvironmentBadgeData }
  | { type: 'projectStatusChanged'; projectId: string; status: ProjectStatus }
  | { type: 'validationError'; field: string; message: string }
  | { type: 'busMessage'; message: BusMessage };

/**
 * A message routed through the MessageBus between the sidebar and Studio webviews.
 *
 * Messages flow through the extension host — the bus routes each message
 * to the opposite surface from its source.
 */
export interface BusMessage {
  /** Message type identifier (e.g. "focusProject", "agentCreated"). */
  type: string;
  /** The surface that originated this message. */
  source: 'sidebar' | 'studio';
  /** Arbitrary payload data. */
  payload: unknown;
  /** Unique message ID for acknowledgment tracking. */
  id: string;
}
