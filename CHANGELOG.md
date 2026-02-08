# Changelog

All notable changes to the ADK Rust extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
