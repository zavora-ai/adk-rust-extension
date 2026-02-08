/**
 * Multi-Agent Workflow template.
 * Sequential and parallel agent orchestration.
 */

import { TemplateContent } from './types';

/**
 * Required API keys for the multi-agent-workflow template.
 */
export const REQUIRED_API_KEYS = ['GOOGLE_API_KEY'];

/**
 * ADK crates required for the multi-agent-workflow template.
 */
export const ADK_CRATES = ['adk-rust'];

/**
 * Generates Cargo.toml content for a multi-agent workflow project.
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
 * Generates main.rs content for a multi-agent workflow.
 */
export function generateMainRs(projectName: string): string {
  const structName = toStructName(projectName);
  return `//! ${structName} - A multi-agent workflow built with ADK-Rust
//!
//! This demonstrates sequential and parallel agent orchestration.

use adk_rust::prelude::*;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load environment variables from .env file
    dotenv::dotenv().ok();

    // Create specialized agents
    let researcher = Agent::builder()
        .name("Researcher")
        .model("gemini-2.0-flash")
        .system_prompt("You are a research assistant. Gather and summarize information on topics.")
        .build()?;

    let writer = Agent::builder()
        .name("Writer")
        .model("gemini-2.0-flash")
        .system_prompt("You are a skilled writer. Take research and create engaging content.")
        .build()?;

    let editor = Agent::builder()
        .name("Editor")
        .model("gemini-2.0-flash")
        .system_prompt("You are an editor. Review and improve written content for clarity and style.")
        .build()?;

    // Create a sequential workflow: Research -> Write -> Edit
    let workflow = SequentialWorkflow::builder()
        .name("${structName}")
        .agent(researcher)
        .agent(writer)
        .agent(editor)
        .build()?;

    // Run the workflow
    let topic = "the benefits of Rust for AI development";
    println!("Starting workflow for topic: {}", topic);
    
    let result = workflow.run(topic).await?;
    println!("\\nFinal output:\\n{}", result);

    Ok(())
}
`;
}

/**
 * Generates .env.example content for a multi-agent workflow.
 */
export function generateEnvExample(): string {
  return `# Google API Key for Gemini model access
# Get your key at: https://makersuite.google.com/app/apikey
GOOGLE_API_KEY=your_google_api_key_here
`;
}

/**
 * Generates README.md content for a multi-agent workflow project.
 */
export function generateReadme(projectName: string): string {
  return `# ${projectName}

A multi-agent workflow built with ADK-Rust.

## Features

- Sequential agent orchestration
- Specialized agents (Researcher, Writer, Editor)
- Pipeline-style processing

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

## Workflow Architecture

This template demonstrates a sequential workflow:

1. **Researcher** - Gathers information on the topic
2. **Writer** - Creates content from the research
3. **Editor** - Polishes the final output

## Customization

### Adding Parallel Execution

\`\`\`rust
let parallel = ParallelWorkflow::builder()
    .agent(agent1)
    .agent(agent2)
    .build()?;
\`\`\`

### Combining Sequential and Parallel

\`\`\`rust
let workflow = SequentialWorkflow::builder()
    .agent(researcher)
    .workflow(parallel_writers)  // Multiple writers in parallel
    .agent(editor)
    .build()?;
\`\`\`

## Project Structure

- \`src/main.rs\` - Workflow implementation
- \`.env\` - Environment variables (API keys)
- \`Cargo.toml\` - Rust dependencies

## Learn More

- [ADK-Rust Documentation](https://github.com/adk-rust/adk)
- [Gemini API Documentation](https://ai.google.dev/docs)
`;
}

/**
 * Gets all template content for the multi-agent-workflow template.
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
