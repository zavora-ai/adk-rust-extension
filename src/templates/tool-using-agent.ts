/**
 * Tool-Using Agent template.
 * Agent with custom FunctionTool capabilities using ADK-Rust.
 */

import { TemplateContent } from './types';

/**
 * Required API keys for the tool-using-agent template.
 */
export const REQUIRED_API_KEYS = ['GOOGLE_API_KEY'];

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
adk-rust = "0.3"
tokio = { version = "1", features = ["full"] }
dotenvy = "0.15"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
`;
}

/**
 * Generates main.rs content for a tool-using agent.
 */
export function generateMainRs(projectName: string): string {
  const structName = toStructName(projectName);
  return `//! ${structName} — A tool-using agent built with ADK-Rust
//!
//! Demonstrates how to create custom FunctionTools and attach them to an agent.

use adk_rust::prelude::*;
use adk_rust::Launcher;
use adk_rust::serde_json::{json, Value};

/// A weather lookup tool. Replace the body with a real API call.
async fn get_weather(_ctx: Arc<dyn ToolContext>, args: Value) -> Result<Value> {
    let city = args["city"].as_str().unwrap_or("Unknown");
    // TODO: call a real weather API here
    Ok(json!({
        "city": city,
        "temperature_f": 72,
        "condition": "Sunny"
    }))
}

/// A simple calculator tool.
async fn calculate(_ctx: Arc<dyn ToolContext>, args: Value) -> Result<Value> {
    let a = args["a"].as_f64().unwrap_or(0.0);
    let b = args["b"].as_f64().unwrap_or(0.0);
    let op = args["op"].as_str().unwrap_or("add");

    let result = match op {
        "add" => a + b,
        "sub" => a - b,
        "mul" => a * b,
        "div" if b != 0.0 => a / b,
        "div" => return Ok(json!({"error": "division by zero"})),
        _ => return Ok(json!({"error": format!("unknown op: {}", op)})),
    };

    Ok(json!({"result": result}))
}

#[tokio::main]
async fn main() -> Result<()> {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();

    let api_key = std::env::var("GOOGLE_API_KEY")
        .expect("GOOGLE_API_KEY must be set in .env file");

    let model = Arc::new(GeminiModel::new(&api_key, "gemini-2.5-flash")?);

    // Create tools
    let weather_tool = FunctionTool::new(
        "get_weather",
        "Get current weather for a city. Args: {city: string}",
        get_weather,
    );

    let calc_tool = FunctionTool::new(
        "calculate",
        "Basic arithmetic. Args: {a: number, b: number, op: add|sub|mul|div}",
        calculate,
    );

    // Build the agent with tools
    let agent = LlmAgentBuilder::new("${structName}")
        .description("An assistant with weather and calculator tools")
        .instruction(
            "You are a helpful assistant. Use the get_weather tool when asked about weather, \\
             and the calculate tool for math. Always show your reasoning.",
        )
        .model(model)
        .tool(Arc::new(weather_tool))
        .tool(Arc::new(calc_tool))
        .build()?;

    // Interactive console — try: "What's the weather in Tokyo?"
    Launcher::new(Arc::new(agent)).run().await?;

    Ok(())
}
`;
}

/**
 * Generates .env.example content for a tool-using agent.
 */
export function generateEnvExample(): string {
  return `# Google API Key for Gemini model access
# Get your key at: https://aistudio.google.com/apikey
GOOGLE_API_KEY=your_google_api_key_here
`;
}

/**
 * Generates README.md content for a tool-using agent project.
 */
export function generateReadme(projectName: string): string {
  return `# ${projectName}

A tool-using agent built with [ADK-Rust](https://github.com/adk-rust/adk).

## Features

- Custom \`FunctionTool\` integration (weather + calculator)
- Automatic tool execution loop — the LLM decides when to call tools
- Easy to extend with your own async functions

## Setup

1. Copy \`.env.example\` to \`.env\` and add your API key:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

2. Build and run:
   \`\`\`bash
   cargo run
   \`\`\`

3. Try prompts like:
   - "What's the weather in Paris?"
   - "What is 42 * 17?"

## Adding Your Own Tools

Define an async function and wrap it with \`FunctionTool\`:

\`\`\`rust
async fn my_tool(_ctx: Arc<dyn ToolContext>, args: Value) -> Result<Value> {
    // your logic here
    Ok(json!({"result": "done"}))
}

let tool = FunctionTool::new("my_tool", "Description for the LLM", my_tool);
\`\`\`

Then add it to the agent with \`.tool(Arc::new(tool))\`.

## Project Structure

- \`src/main.rs\` — Agent and tool definitions
- \`.env\` — API keys (not committed to git)
- \`Cargo.toml\` — Rust dependencies

## Learn More

- [ADK-Rust Docs](https://docs.rs/adk-rust)
- [FunctionTool API](https://docs.rs/adk-tool)
- [Gemini API](https://ai.google.dev/docs)
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
