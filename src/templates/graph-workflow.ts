/**
 * Graph Workflow template.
 * LangGraph-style workflow with state management using adk-graph.
 */

import { TemplateContent } from './types';

/**
 * Required API keys for the graph-workflow template.
 */
export const REQUIRED_API_KEYS = ['GOOGLE_API_KEY'];

/**
 * ADK crates required for the graph-workflow template.
 */
export const ADK_CRATES = ['adk-rust'];

/**
 * Generates Cargo.toml content for a graph workflow project.
 */
export function generateCargoToml(projectName: string): string {
  return `[package]
name = "${projectName}"
version = "0.1.0"
edition = "2021"

[dependencies]
adk-rust = { version = "0.3", features = ["graph"] }
tokio = { version = "1", features = ["full"] }
dotenvy = "0.15"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
`;
}

/**
 * Generates main.rs content for a graph workflow.
 */
export function generateMainRs(projectName: string): string {
  const structName = toStructName(projectName);
  return `//! ${structName} — A graph workflow built with ADK-Rust
//!
//! Demonstrates a LangGraph-style stateful graph with parallel node execution.
//! Two function nodes run in parallel (translate + summarize), producing
//! independent outputs from the same input.

use adk_rust::prelude::*;
use adk_rust::graph::{
    GraphAgent, StateGraph, NodeOutput,
    START, END, State,
    ExecutionConfig,
};
use adk_rust::serde_json::json;

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();

    // --- Build the graph ---
    // Two nodes run in parallel from START, both write to shared state.

    let graph = StateGraph::with_channels(&["input", "translation", "summary"])
        .add_node_fn("translator", |ctx| async move {
            let text = ctx.get("input")
                .and_then(|v| v.as_str())
                .unwrap_or("(no input)");

            // In a real app, call an LLM or translation API here
            let translated = format!("[French] {}", text);

            Ok(NodeOutput::new().with_update("translation", json!(translated)))
        })
        .add_node_fn("summarizer", |ctx| async move {
            let text = ctx.get("input")
                .and_then(|v| v.as_str())
                .unwrap_or("(no input)");

            // In a real app, call an LLM here
            let summary = format!("Summary: {}", &text[..text.len().min(80)]);

            Ok(NodeOutput::new().with_update("summary", json!(summary)))
        })
        .add_edge(START, "translator")
        .add_edge(START, "summarizer")   // both start in parallel
        .add_edge("translator", END)
        .add_edge("summarizer", END)
        .compile()?;

    // --- Execute ---

    let mut input = State::new();
    input.insert(
        "input".to_string(),
        json!("Rust is transforming how we build reliable, high-performance AI systems."),
    );

    let result = graph.invoke(input, ExecutionConfig::new("thread-1")).await?;

    println!("Translation: {}",
        result.get("translation").and_then(|v| v.as_str()).unwrap_or("(none)"));
    println!("Summary: {}",
        result.get("summary").and_then(|v| v.as_str()).unwrap_or("(none)"));

    Ok(())
}
`;
}

/**
 * Generates .env.example content for a graph workflow.
 */
export function generateEnvExample(): string {
  return `# Google API Key for Gemini model access
# Get your key at: https://aistudio.google.com/apikey
GOOGLE_API_KEY=your_google_api_key_here
`;
}

/**
 * Generates README.md content for a graph workflow project.
 */
export function generateReadme(projectName: string): string {
  return `# ${projectName}

A graph workflow built with [ADK-Rust](https://github.com/adk-rust/adk), inspired by LangGraph.

## How It Works

Two function nodes run in parallel on the same input:

\`\`\`
         ┌────────────┐
         │   START     │
         └──┬──────┬───┘
            │      │
   ┌────────▼──┐ ┌─▼─────────┐
   │ Translator│ │ Summarizer │
   └────────┬──┘ └─┬─────────┘
            │      │
         ┌──▼──────▼───┐
         │     END      │
         └──────────────┘
\`\`\`

Each node reads from shared state and writes its output back.

## Setup

1. Copy \`.env.example\` to \`.env\` and add your API key:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

2. Build and run:
   \`\`\`bash
   cargo run
   \`\`\`

## Key Concepts

- **State** — a key-value map shared across all nodes
- **NodeOutput** — state updates returned by each node
- **Edges** — define execution order; multiple edges from START = parallel
- **Conditional edges** — route dynamically based on state values

## Adding Conditional Routing

\`\`\`rust
.add_conditional_edges(
    "classifier",
    |state| state.get("sentiment")
        .and_then(|v| v.as_str())
        .unwrap_or("neutral")
        .to_string(),
    [("positive", "happy_handler"), ("negative", "sad_handler")],
)
\`\`\`

## Project Structure

- \`src/main.rs\` — Graph definition and execution
- \`.env\` — API keys (not committed to git)
- \`Cargo.toml\` — Rust dependencies

## Learn More

- [ADK-Rust Docs](https://docs.rs/adk-rust)
- [adk-graph Docs](https://docs.rs/adk-graph)
- [LangGraph Concepts](https://langchain-ai.github.io/langgraph/)
`;
}

/**
 * Gets all template content for the graph-workflow template.
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
