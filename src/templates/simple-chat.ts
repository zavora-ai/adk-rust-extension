/**
 * Simple Chat Agent template.
 * Basic conversational agent with LLM integration using ADK-Rust.
 */

import { TemplateContent } from './types';

/**
 * Required API keys for the simple-chat template.
 */
export const REQUIRED_API_KEYS = ['GOOGLE_API_KEY'];

/**
 * ADK crates required for the simple-chat template.
 */
export const ADK_CRATES = ['adk-rust'];

/**
 * Generates Cargo.toml content for a simple chat agent project.
 */
export function generateCargoToml(projectName: string): string {
  return `[package]
name = "${projectName}"
version = "0.1.0"
edition = "2021"

[dependencies]
adk-rust = "0.3"
tokio = { version = "1", features = ["full"] }
dotenvy = "0.15"
`;
}

/**
 * Generates main.rs content for a simple chat agent.
 */
export function generateMainRs(projectName: string): string {
  const structName = toStructName(projectName);
  return `//! ${structName} — A simple chat agent built with ADK-Rust
//!
//! Launches an interactive console session powered by Gemini.

use adk_rust::prelude::*;
use adk_rust::Launcher;

#[tokio::main]
async fn main() -> Result<()> {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();

    let api_key = std::env::var("GOOGLE_API_KEY")
        .expect("GOOGLE_API_KEY must be set in .env file");

    let model = Arc::new(GeminiModel::new(&api_key, "gemini-2.5-flash")?);

    // Build a simple chat agent
    let agent = LlmAgentBuilder::new("${structName}")
        .description("A helpful AI assistant")
        .instruction("You are a friendly assistant. Answer questions concisely and helpfully.")
        .model(model)
        .build()?;

    // Run in interactive console mode — type messages and get responses
    Launcher::new(Arc::new(agent)).run().await?;

    Ok(())
}
`;
}

/**
 * Generates .env.example content for a simple chat agent.
 */
export function generateEnvExample(): string {
  return `# Google API Key for Gemini model access
# Get your key at: https://aistudio.google.com/apikey
GOOGLE_API_KEY=your_google_api_key_here
`;
}

/**
 * Generates README.md content for a simple chat agent project.
 */
export function generateReadme(projectName: string): string {
  return `# ${projectName}

A simple chat agent built with [ADK-Rust](https://github.com/adk-rust/adk).

## Setup

1. Copy \`.env.example\` to \`.env\` and add your API key:
   \`\`\`bash
   cp .env.example .env
   # Edit .env and set GOOGLE_API_KEY
   \`\`\`

2. Build and run:
   \`\`\`bash
   cargo run
   \`\`\`

   This starts an interactive console session. Type a message and press Enter.

## Project Structure

- \`src/main.rs\` — Agent definition and launcher
- \`.env\` — API keys (not committed to git)
- \`Cargo.toml\` — Rust dependencies

## Customization

Open \`src/main.rs\` to change:
- The agent's instruction (system prompt)
- The model (default: \`gemini-2.5-flash\`)

## Learn More

- [ADK-Rust Docs](https://docs.rs/adk-rust)
- [Gemini API](https://ai.google.dev/docs)
`;
}

/**
 * Gets all template content for the simple-chat template.
 */
export function getTemplateContent(projectName: string): TemplateContent {
  return {
    cargoToml: generateCargoToml(projectName),
    mainRs: generateMainRs(projectName),
    envExample: generateEnvExample(),
    readme: generateReadme(projectName),
  };
}

/**
 * Converts a project name to a Rust struct name (PascalCase).
 */
function toStructName(projectName: string): string {
  return projectName
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}
