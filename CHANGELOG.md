# Changelog

All notable changes to the ADK Rust extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] - 2025-02-15

### Added

- **VS Code Theme Synchronization**: The ADK Studio webview now matches the active VS Code color theme. Dark, light, high-contrast dark, and high-contrast light themes are all supported. A `MutationObserver` watches for theme changes in real time and forwards 33 CSS variables (surfaces, buttons, inputs, dropdowns, text, borders, list/tree) to the embedded iframe via `postMessage` and a `?theme=` query parameter.

- **Binary Detection for Studio Fallback**: Added `isBinaryInstalled()` method to `StudioManager` that probes for the `adk-studio` binary before deciding what to show. When the binary is installed but the server is not yet running, users see the loading/retry UI instead of the README fallback. The README is now reserved for the case where `adk-studio` is genuinely not installed.

### Changed

- **Templates Updated to adk-rust 0.3 API**: All four project templates have been rewritten to target the adk-rust 0.3 crate API. Changes include:
  - `simple-chat` — Uses `AgentBuilder`, `GeminiClient`, `Runner`, and `InMemorySessionService`. Model set to `gemini-2.5-flash`.
  - `tool-using-agent` — Uses `FunctionTool::new()` with `#[tool]` macro, `ToolConfig`, and `AgentBuilder::new().tools()`. Includes a `google_search` tool example.
  - `multi-agent-workflow` — Uses `SequentialAgent` and `ParallelAgent` from `adk_rust::agents`, composing sub-agents via `AgentBuilder`.
  - `graph-workflow` — Uses `petgraph` for state-machine workflows with typed node/edge graphs. No LLM dependency.
  - All templates use `dotenvy` (maintained fork) instead of `dotenv`.
  - All templates target model `gemini-2.5-flash` and reference `aistudio.google.com/apikey` for key setup.
  - All four templates verified to compile successfully against adk-rust 0.3.

- **ADK Studio Marked as Required**: The README and environment checker no longer describe ADK Studio as optional. It is a required dependency for the full extension experience.

- **Unpinned adk-studio Version**: Removed the `@0.3.0` version pin from `cargo install adk-studio` across README, `studioManager.ts`, and `environmentChecker.ts`. Users now install the latest release by default.

- **Dark Mode Support for README Webview**: The README fallback webview (shown when `adk-studio` is not installed) now uses VS Code theme CSS variables instead of hardcoded light-mode colors. It renders correctly in dark, light, and high-contrast themes.

### Fixed

- **Module-Level Helper Functions**: Moved `readReadmeAsHtml`, `markdownToHtml`, `escapeHtmlChars`, and `inlineFormat` from inside the `StudioManager` class body to module scope. These were incorrectly nested inside the class, causing potential scoping issues.

## [0.0.1] - 2025-01-01

### Added

- **Project Scaffolding**: Create new ADK Rust projects from four built-in templates — Simple Chat, Tool-Using Agent, Multi-Agent Workflow, and Graph Workflow
- **Project Detection & Tree View**: Automatically detect ADK projects in the workspace and display them in a dedicated sidebar panel
- **Build & Run Commands**: Build and run ADK projects directly from the command palette or sidebar context menu
- **ADK Studio Integration**: Launch and manage the ADK Studio visual builder via an embedded webview with server lifecycle management
- **Environment Checker**: Verify Rust toolchain, ADK Studio, and API key availability with actionable guidance
- **API Key Configuration**: Configure API keys for Google, OpenAI, and Anthropic providers through a guided UI flow
- **Post-Creation Guidance**: Step-by-step onboarding after project creation — copy `.env.example`, set API keys, and check the environment
- **Studio Settings Shortcut**: Quick access to ADK Studio configuration (port, auto-start, binary path) from the sidebar
