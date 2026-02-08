/**
 * Simple Chat Agent template.
 * Basic conversational agent with LLM integration.
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
adk-rust = "0.2"
tokio = { version = "1", features = ["full"] }
dotenv = "0.15"
`;
}

/**
 * Generates main.rs content for a simple chat agent.
 */
export function generateMainRs(projectName: string): string {
  const structName = toStructName(projectName);
  return `//! ${structName} - A simple chat agent built with ADK-Rust
//!
//! This agent demonstrates basic conversational capabilities using an LLM.

use adk_rust::prelude::*;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load environment variables from .env file
    dotenv::dotenv().ok();

    // Create a simple chat agent
    let agent = Agent::builder()
        .name("${structName}")
        .model("gemini-2.0-flash")
        .system_prompt("You are a helpful assistant.")
        .build()?;

    // Run the agent with a sample prompt
    let response = agent.run("Hello! How can you help me today?").await?;
    println!("{}", response);

    Ok(())
}
`;
}

/**
 * Generates .env.example content for a simple chat agent.
 */
export function generateEnvExample(): string {
  return `# Google API Key for Gemini model access
# Get your key at: https://makersuite.google.com/app/apikey
GOOGLE_API_KEY=your_google_api_key_here
`;
}

/**
 * Generates README.md content for a simple chat agent project.
 */
export function generateReadme(projectName: string): string {
  return `# ${projectName}

A simple chat agent built with ADK-Rust.

## Setup

1. Copy \`.env.example\` to \`.env\`:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

2. Add your Google API key to \`.env\`:
   \`\`\`
   GOOGLE_API_KEY=your_actual_api_key
   \`\`\`

3. Build and run:
   \`\`\`bash
   cargo run
   \`\`\`

## Project Structure

- \`src/main.rs\` - Main agent implementation
- \`.env\` - Environment variables (API keys)
- \`Cargo.toml\` - Rust dependencies

## Customization

Edit \`src/main.rs\` to customize:
- The agent's system prompt
- The model used (default: gemini-2.0-flash)
- The conversation flow

## Learn More

- [ADK-Rust Documentation](https://github.com/adk-rust/adk)
- [Gemini API Documentation](https://ai.google.dev/docs)
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
