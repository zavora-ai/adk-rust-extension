/**
 * Tool-Using Agent template.
 * Agent with function tools and Google Search capabilities.
 */

import { TemplateContent } from './types';

/**
 * Required API keys for the tool-using-agent template.
 */
export const REQUIRED_API_KEYS = ['GOOGLE_API_KEY', 'GOOGLE_SEARCH_API_KEY'];

/**
 * ADK crates required for the tool-using-agent template.
 */
export const ADK_CRATES = ['adk-rust'];

/**
 * Generates Cargo.toml content for a tool-using agent project.
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
serde = { version = "1", features = ["derive"] }
serde_json = "1"
`;
}

/**
 * Generates main.rs content for a tool-using agent.
 */
export function generateMainRs(projectName: string): string {
  const structName = toStructName(projectName);
  return `//! ${structName} - A tool-using agent built with ADK-Rust
//!
//! This agent demonstrates how to use function tools and external APIs.

use adk_rust::prelude::*;
use serde::{Deserialize, Serialize};

/// Input for the calculator tool
#[derive(Debug, Serialize, Deserialize)]
struct CalculatorInput {
    operation: String,
    a: f64,
    b: f64,
}

/// A simple calculator tool
fn calculator(input: CalculatorInput) -> Result<f64, String> {
    match input.operation.as_str() {
        "add" => Ok(input.a + input.b),
        "subtract" => Ok(input.a - input.b),
        "multiply" => Ok(input.a * input.b),
        "divide" => {
            if input.b == 0.0 {
                Err("Cannot divide by zero".to_string())
            } else {
                Ok(input.a / input.b)
            }
        }
        _ => Err(format!("Unknown operation: {}", input.operation)),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load environment variables from .env file
    dotenv::dotenv().ok();

    // Create a tool-using agent
    let agent = Agent::builder()
        .name("${structName}")
        .model("gemini-2.0-flash")
        .system_prompt("You are a helpful assistant with access to a calculator tool. Use it when asked to perform mathematical operations.")
        .tool("calculator", "Performs basic arithmetic operations (add, subtract, multiply, divide)", calculator)
        .build()?;

    // Run the agent with a calculation request
    let response = agent.run("What is 42 multiplied by 17?").await?;
    println!("{}", response);

    Ok(())
}
`;
}

/**
 * Generates .env.example content for a tool-using agent.
 */
export function generateEnvExample(): string {
  return `# Google API Key for Gemini model access
# Get your key at: https://makersuite.google.com/app/apikey
GOOGLE_API_KEY=your_google_api_key_here

# Google Search API Key (optional, for web search capabilities)
# Get your key at: https://developers.google.com/custom-search/v1/introduction
GOOGLE_SEARCH_API_KEY=your_google_search_api_key_here
`;
}

/**
 * Generates README.md content for a tool-using agent project.
 */
export function generateReadme(projectName: string): string {
  return `# ${projectName}

A tool-using agent built with ADK-Rust.

## Features

- Function tool integration
- Calculator tool example
- Extensible tool system

## Setup

1. Copy \`.env.example\` to \`.env\`:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

2. Add your API keys to \`.env\`:
   \`\`\`
   GOOGLE_API_KEY=your_actual_api_key
   GOOGLE_SEARCH_API_KEY=your_search_api_key  # Optional
   \`\`\`

3. Build and run:
   \`\`\`bash
   cargo run
   \`\`\`

## Adding Custom Tools

To add your own tools, define a function and register it with the agent:

\`\`\`rust
fn my_tool(input: MyInput) -> Result<MyOutput, String> {
    // Tool implementation
}

let agent = Agent::builder()
    .tool("my_tool", "Description of what it does", my_tool)
    .build()?;
\`\`\`

## Project Structure

- \`src/main.rs\` - Main agent implementation with tools
- \`.env\` - Environment variables (API keys)
- \`Cargo.toml\` - Rust dependencies

## Learn More

- [ADK-Rust Documentation](https://github.com/adk-rust/adk)
- [Gemini API Documentation](https://ai.google.dev/docs)
`;
}

/**
 * Gets all template content for the tool-using-agent template.
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
