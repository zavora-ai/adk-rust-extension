/**
 * Multi-Agent Workflow template.
 * Sequential agent orchestration with ADK-Rust.
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
adk-rust = "0.3"
tokio = { version = "1", features = ["full"] }
dotenvy = "0.15"
`;
}

/**
 * Generates main.rs content for a multi-agent workflow.
 */
export function generateMainRs(projectName: string): string {
  const structName = toStructName(projectName);
  return `//! ${structName} — A multi-agent workflow built with ADK-Rust
//!
//! Demonstrates sequential agent orchestration using SequentialAgent.

use adk_rust::prelude::*;
use adk_rust::Launcher;

#[tokio::main]
async fn main() -> Result<()> {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();

    let api_key = std::env::var("GOOGLE_API_KEY")
        .expect("GOOGLE_API_KEY must be set in .env file");

    let model = Arc::new(GeminiModel::new(&api_key, "gemini-2.5-flash")?);

    // --- Specialist agents ---

    let researcher: Arc<dyn Agent> = Arc::new(
        LlmAgentBuilder::new("researcher")
            .description("Gathers information on a topic")
            .instruction(
                "You are a research assistant. Given a topic, provide a concise summary \\
                 of the key facts, recent developments, and important context.",
            )
            .model(model.clone())
            .build()?,
    );

    let writer: Arc<dyn Agent> = Arc::new(
        LlmAgentBuilder::new("writer")
            .description("Writes engaging content from research")
            .instruction(
                "You are a skilled writer. Take the research provided and produce a clear, \\
                 engaging article of about 300 words. Use a professional but approachable tone.",
            )
            .model(model.clone())
            .build()?,
    );

    let editor: Arc<dyn Agent> = Arc::new(
        LlmAgentBuilder::new("editor")
            .description("Reviews and polishes written content")
            .instruction(
                "You are an editor. Review the article for clarity, grammar, and style. \\
                 Output the improved version.",
            )
            .model(model.clone())
            .build()?,
    );

    // --- Sequential pipeline: Research → Write → Edit ---

    let pipeline = SequentialAgent::new(
        "${structName}",
        vec![researcher, writer, editor],
    );

    // Launch the pipeline in interactive console mode
    Launcher::new(Arc::new(pipeline)).run().await?;

    Ok(())
}
`;
}

/**
 * Generates .env.example content for a multi-agent workflow.
 */
export function generateEnvExample(): string {
  return `# Google API Key for Gemini model access
# Get your key at: https://aistudio.google.com/apikey
GOOGLE_API_KEY=your_google_api_key_here
`;
}

/**
 * Generates README.md content for a multi-agent workflow project.
 */
export function generateReadme(projectName: string): string {
  return `# ${projectName}

A multi-agent workflow built with [ADK-Rust](https://github.com/adk-rust/adk).

## How It Works

Three specialist agents run in sequence:

1. **Researcher** — gathers key facts on the topic
2. **Writer** — turns the research into an article
3. **Editor** — polishes the final output

The output of each agent feeds into the next via \`SequentialAgent\`.

## Setup

1. Copy \`.env.example\` to \`.env\` and add your API key:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

2. Build and run:
   \`\`\`bash
   cargo run
   \`\`\`

3. Enter a topic (e.g. "benefits of Rust for AI") and watch the pipeline run.

## Parallel Execution

You can also run agents concurrently with \`ParallelAgent\`:

\`\`\`rust
let team = ParallelAgent::new("analysts", vec![analyst_a, analyst_b]);
\`\`\`

Or combine both:

\`\`\`rust
let workflow = SequentialAgent::new("pipeline", vec![
    Arc::new(ParallelAgent::new("research_team", vec![agent_a, agent_b])),
    writer,
    editor,
]);
\`\`\`

## Project Structure

- \`src/main.rs\` — Workflow definition
- \`.env\` — API keys (not committed to git)
- \`Cargo.toml\` — Rust dependencies

## Learn More

- [ADK-Rust Docs](https://docs.rs/adk-rust)
- [Workflow Agents](https://docs.rs/adk-agent)
- [Gemini API](https://ai.google.dev/docs)
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
