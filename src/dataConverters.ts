/**
 * Pure conversion functions that transform internal domain models into
 * view-layer data structures consumed by the sidebar webview.
 *
 * These functions are intentionally free of side effects so they can be
 * property-tested with fast-check.
 *
 * @module dataConverters
 */

import type { EnvironmentStatus } from './environmentChecker';
import type { AdkProject, AgentInfo } from './projectTreeProvider';
import type { AgentCardData, EnvironmentBadgeData, ProjectCardData } from './types';

/**
 * Converts an {@link AgentInfo} domain object to an {@link AgentCardData}
 * view model suitable for rendering in the sidebar webview.
 *
 * @param agent - Agent information from project detection
 * @returns Agent card data for the sidebar UI
 *
 * @example
 * const card = toAgentCardData({
 *   name: 'weather',
 *   type: 'llm',
 *   filePath: '/projects/demo/src/main.rs',
 *   line: 42,
 * });
 * // { name: 'weather', type: 'llm', filePath: '...', line: 42 }
 */
export function toAgentCardData(agent: AgentInfo): AgentCardData {
  return {
    name: agent.name,
    type: agent.type,
    filePath: agent.filePath,
    line: agent.line,
  };
}

/**
 * Converts an array of detected {@link AdkProject} objects into
 * {@link ProjectCardData} view models for the sidebar webview.
 *
 * Each project maps one-to-one to a card. The project's absolute path is
 * used as the card `id`, `templateType` defaults to `null` (template
 * detection from existing projects is not supported), and `status` defaults
 * to `'stopped'`.
 *
 * @param projects - Detected ADK projects in the workspace
 * @param studioAvailable - Whether the `adk-studio` binary is available
 * @returns Array of project card data, one per input project
 *
 * @example
 * const cards = toProjectCardData(
 *   [{ name: 'demo', path: '/projects/demo', agents: [] }],
 *   true,
 * );
 * // [{ id: '/projects/demo', name: 'demo', templateType: null,
 * //    status: 'stopped', agents: [], studioAvailable: true }]
 */
export function toProjectCardData(
  projects: AdkProject[],
  studioAvailable: boolean,
): ProjectCardData[] {
  return projects.map((project) => ({
    id: project.path,
    name: project.name,
    templateType: null,
    status: 'stopped',
    agents: project.agents.map(toAgentCardData),
    studioAvailable,
  }));
}

/**
 * Converts an {@link EnvironmentStatus} into an {@link EnvironmentBadgeData}
 * view model for the sidebar environment badge.
 *
 * Health is determined by tool availability:
 * - `'error'`   — rustc or cargo is missing
 * - `'warning'` — rustc and cargo are available but adk-studio is missing
 * - `'ok'`      — all three tools are available
 *
 * @param status - Environment status from the environment checker
 * @returns Badge data for the sidebar UI
 *
 * @example
 * const badge = toEnvironmentBadgeData({
 *   rustc:    { available: true,  path: '/usr/bin/rustc', version: '1.78.0', error: null },
 *   cargo:    { available: true,  path: '/usr/bin/cargo', version: '1.78.0', error: null },
 *   adkStudio:{ available: false, path: null, version: null, error: 'not found' },
 *   apiKeys:  [{ name: 'Google Api Key', envVar: 'GOOGLE_API_KEY', present: true }],
 * });
 * // badge.health === 'warning'
 * // badge.studioAvailable === false
 * // badge.apiKeys === { configured: 1, total: 1 }
 */
export function toEnvironmentBadgeData(status: EnvironmentStatus): EnvironmentBadgeData {
  const coreAvailable = status.rustc.available && status.cargo.available;

  let health: EnvironmentBadgeData['health'];
  if (!coreAvailable) {
    health = 'error';
  } else if (!status.adkStudio.available) {
    health = 'warning';
  } else {
    health = 'ok';
  }

  const tools = [
    { name: 'rustc', available: status.rustc.available, version: status.rustc.version },
    { name: 'cargo', available: status.cargo.available, version: status.cargo.version },
    { name: 'adk-studio', available: status.adkStudio.available, version: status.adkStudio.version },
  ];

  const configured = status.apiKeys.filter((k) => k.present).length;

  return {
    health,
    tools,
    apiKeys: {
      configured,
      total: status.apiKeys.length,
    },
    studioAvailable: status.adkStudio.available,
  };
}


/**
 * Determines whether the Studio webview should auto-open on activation.
 *
 * Returns `true` if and only if all of the following hold:
 * - At least one ADK project exists in the workspace
 * - The `autoStartStudio` setting is enabled
 * - The `studioAutoOpen` setting is enabled
 * - The `adk-studio` binary is available
 * - The user has not dismissed the Studio tab in the current session
 *
 * @param projectCount - Number of detected ADK projects in the workspace
 * @param settings - Relevant extension settings
 * @param studioAvailable - Whether the `adk-studio` binary is installed and reachable
 * @param dismissedInSession - Whether the user closed the Studio tab this session
 * @returns `true` if Studio should auto-open, `false` otherwise
 *
 * @example
 * shouldAutoOpenStudio(2, { autoStartStudio: true, studioAutoOpen: true }, true, false);
 * // true
 *
 * @example
 * shouldAutoOpenStudio(0, { autoStartStudio: true, studioAutoOpen: true }, true, false);
 * // false — no projects detected
 */
export function shouldAutoOpenStudio(
  projectCount: number,
  settings: { autoStartStudio: boolean; studioAutoOpen: boolean },
  studioAvailable: boolean,
  dismissedInSession: boolean,
): boolean {
  return (
    projectCount > 0 &&
    settings.autoStartStudio &&
    settings.studioAutoOpen &&
    studioAvailable &&
    !dismissedInSession
  );
}

