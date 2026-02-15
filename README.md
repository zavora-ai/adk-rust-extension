# ADK Rust — VS Code Extension

A VS Code extension for building [ADK-Rust](https://github.com/adk-rust) agents. Provides project scaffolding, environment checking, build/run integration, and the ADK Studio visual builder — all from your editor.

## Features

- **Project Scaffolding** — Create new ADK agent projects from four built-in templates targeting adk-rust 0.3
- **Environment Checking** — Verify your Rust toolchain, ADK Studio, and API keys in one click
- **Build & Run** — Compile and run agents directly from the sidebar or command palette
- **ADK Studio** — Launch the visual agent builder in a webview panel with automatic VS Code theme synchronization
- **API Key Management** — Configure provider API keys without editing `.env` files manually
- **Project Tree View** — Browse and manage ADK projects from the sidebar

## Prerequisites

### Rust Toolchain (required)

Install `rustc` and `cargo` via [rustup](https://rustup.rs):

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Verify the installation:

```sh
rustc --version
cargo --version
```

### ADK Studio (required)

ADK Studio is the visual agent builder for ADK Rust. It powers the extension's main webview panel.

See the [ADK Studio Installation](#adk-studio-installation) section below.

## ADK Studio Installation

### Install via Cargo

```sh
cargo install adk-studio
```

### Verify Installation

```sh
adk-studio --version
```

After installing, restart the environment check or reopen VS Code.

## Getting Started

1. **Install the extension** — Search for "ADK Rust" in the VS Code Extensions view and click Install.

2. **Create a project** — Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **ADK Rust: Create Project**. Pick a template and a folder.

3. **Set up your `.env`** — After creation, click **Set Up .env** in the notification to copy `.env.example` to `.env`. Add your API keys (e.g. `GOOGLE_API_KEY`).

4. **Build the project** — Run **ADK Rust: Build Project** from the command palette or click the build icon in the sidebar.

5. **Run the agent** — Run **ADK Rust: Run Project** to start your agent.

> **Tip:** Use **ADK Rust: Check Environment** at any time to verify your toolchain, ADK Studio, and API keys are configured correctly.

## Commands

| Command | Icon | Description |
|---------|------|-------------|
| ADK Rust: Open Studio | `$(radio-tower)` | Opens the ADK Studio webview panel |
| ADK Rust: Create Project | `$(add)` | Scaffolds a new ADK project from templates |
| ADK Rust: Build Project | `$(gear)` | Builds the project with `cargo build` |
| ADK Rust: Run Project | `$(play)` | Runs the ADK agent with `cargo run` |
| ADK Rust: Check Environment | `$(checklist)` | Verifies Rust toolchain, ADK Studio, and API keys |
| ADK Rust: View Logs | `$(output)` | Opens the extension output channel |
| Refresh ADK Projects | `$(refresh)` | Refreshes the project tree view |
| ADK Rust: Configure API Keys | `$(gear)` | Configure API keys for supported providers |
| ADK Rust: Open Settings | `$(settings-gear)` | Opens VS Code settings filtered to `adkRust` |

## Configuration

All settings are under the `adkRust` namespace. Open them quickly with **ADK Rust: Open Settings**.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `adkRust.studioPort` | `number` | `3000` | Port for the ADK Studio server |
| `adkRust.defaultTemplate` | `string` | `"simple-chat"` | Default template for new projects (`simple-chat`, `tool-using-agent`, `multi-agent-workflow`, `graph-workflow`) |
| `adkRust.adkStudioPath` | `string \| null` | `null` | Custom path to the `adk-studio` binary. Leave empty to use PATH. |
| `adkRust.cargoPath` | `string \| null` | `null` | Custom path to the `cargo` binary. Leave empty to use PATH. |
| `adkRust.rustcPath` | `string \| null` | `null` | Custom path to the `rustc` binary. Leave empty to use PATH. |
| `adkRust.autoStartStudio` | `boolean` | `true` | Automatically start ADK Studio when the extension activates |
| `adkRust.studioAutoOpen` | `boolean` | `true` | Automatically open the ADK Studio webview when ADK projects are detected |
| `adkRust.sidebarWebview` | `boolean` | `true` | Use the rich sidebar webview instead of the native tree view |
| `adkRust.verbosity` | `string` | `"normal"` | Output verbosity: `quiet`, `normal`, or `verbose` |

## Keybindings

| Shortcut | Command | When |
|----------|---------|------|
| `Ctrl+Shift+B` / `Cmd+Shift+B` | Build Project | Editing `.rs` files |

You can bind additional shortcuts (e.g. for **Run Project**) via VS Code's keybinding settings.

## Project Templates

| Template | Description |
|----------|-------------|
| `simple-chat` | Basic conversational agent using `AgentBuilder` and `GeminiClient` |
| `tool-using-agent` | Agent with `#[tool]` macro function tools and Google Search |
| `multi-agent-workflow` | Sequential and parallel agent orchestration with `SequentialAgent` / `ParallelAgent` |
| `graph-workflow` | State-machine workflow using `petgraph` with typed node/edge graphs |

## Troubleshooting

### Extension doesn't appear in the sidebar

- Ensure the extension is installed and enabled.
- Reload the VS Code window (`Ctrl+Shift+P` → **Developer: Reload Window**).

### "Rust compiler not found"

- Install Rust via [rustup](https://rustup.rs).
- If installed to a custom location, set `adkRust.rustcPath` and `adkRust.cargoPath` in settings.
- Restart VS Code after installing Rust.

### Project not detected as an ADK project

- Ensure your `Cargo.toml` declares a dependency on a known ADK crate (e.g. `adk-rust`, `adk-core`, `adk-agent`).
- Click **Refresh ADK Projects** in the sidebar title bar.

### Build or run fails

- Run **ADK Rust: Check Environment** to verify all tools are available.
- Check the output channel (**ADK Rust: View Logs**) for detailed error messages.
- Ensure your `.env` file contains the required API keys for your chosen model provider.

### ADK Studio won't start

- Verify ADK Studio is installed: `adk-studio --version`.
- Check that the configured port (`adkRust.studioPort`, default `3000`) is not in use.
- If installed to a custom location, set `adkRust.adkStudioPath` in settings.

### API keys not detected

- Run **ADK Rust: Check Environment** — it reads the `.env` file from your workspace root.
- Use **ADK Rust: Configure API Keys** to set keys from the sidebar.
- Ensure the `.env` file is in the workspace root.
- For run/build, project-local `.env` values (next to `Cargo.toml`) can still override workspace values.

## License

[Apache-2.0](LICENSE)
