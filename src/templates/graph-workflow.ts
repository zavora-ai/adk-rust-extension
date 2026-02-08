/**
 * Graph Workflow template.
 * LangGraph-style workflow with state management.
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
adk-rust = "0.2"
tokio = { version = "1", features = ["full"] }
dotenv = "0.15"
serde = { version = "1", features = ["derive"] }
`;
}

/**
 * Generates main.rs content for a graph workflow.
 */
export function generateMainRs(projectName: string): string {
  const structName = toStructName(projectName);
  return `//! ${structName} - A graph workflow built with ADK-Rust
//!
//! This demonstrates LangGraph-style workflow with state management.

use adk_rust::prelude::*;
use serde::{Deserialize, Serialize};

/// Workflow state that flows through the graph
#[derive(Debug, Clone, Serialize, Deserialize)]
struct WorkflowState {
    query: String,
    research: Option<String>,
    draft: Option<String>,
    needs_revision: bool,
    final_output: Option<String>,
}

impl Default for WorkflowState {
    fn default() -> Self {
        Self {
            query: String::new(),
            research: None,
            draft: None,
            needs_revision: false,
            final_output: None,
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load environment variables from .env file
    dotenv::dotenv().ok();

    // Create the graph workflow
    let graph = Graph::<WorkflowState>::builder()
        .name("${structName}")
        // Research node
        .node("research", |state: &mut WorkflowState| async {
            let agent = Agent::builder()
                .model("gemini-2.0-flash")
                .system_prompt("Research the given topic and provide key findings.")
                .build()?;
            
            let result = agent.run(&state.query).await?;
            state.research = Some(result);
            Ok(())
        })
        // Draft node
        .node("draft", |state: &mut WorkflowState| async {
            let agent = Agent::builder()
                .model("gemini-2.0-flash")
                .system_prompt("Write a draft based on the research provided.")
                .build()?;
            
            let research = state.research.as_ref().unwrap();
            let result = agent.run(research).await?;
            state.draft = Some(result);
            Ok(())
        })
        // Review node (conditional)
        .node("review", |state: &mut WorkflowState| async {
            let agent = Agent::builder()
                .model("gemini-2.0-flash")
                .system_prompt("Review the draft. Reply 'APPROVED' if good, or provide revision suggestions.")
                .build()?;
            
            let draft = state.draft.as_ref().unwrap();
            let result = agent.run(draft).await?;
            state.needs_revision = !result.contains("APPROVED");
            
            if !state.needs_revision {
                state.final_output = state.draft.clone();
            }
            Ok(())
        })
        // Revise node
        .node("revise", |state: &mut WorkflowState| async {
            let agent = Agent::builder()
                .model("gemini-2.0-flash")
                .system_prompt("Revise the draft based on feedback.")
                .build()?;
            
            let draft = state.draft.as_ref().unwrap();
            let result = agent.run(draft).await?;
            state.draft = Some(result);
            Ok(())
        })
        // Define edges
        .edge("research", "draft")
        .edge("draft", "review")
        .conditional_edge("review", |state| {
            if state.needs_revision { "revise" } else { "end" }
        })
        .edge("revise", "review")  // Loop back for re-review
        // Set entry point
        .entry("research")
        .build()?;

    // Initialize state and run
    let mut state = WorkflowState {
        query: "Explain the benefits of Rust for building AI agents".to_string(),
        ..Default::default()
    };

    println!("Starting graph workflow...");
    graph.run(&mut state).await?;
    
    println!("\\nFinal output:\\n{}", state.final_output.unwrap_or_default());

    Ok(())
}
`;
}

/**
 * Generates .env.example content for a graph workflow.
 */
export function generateEnvExample(): string {
  return `# Google API Key for Gemini model access
# Get your key at: https://makersuite.google.com/app/apikey
GOOGLE_API_KEY=your_google_api_key_here
`;
}

/**
 * Generates README.md content for a graph workflow project.
 */
export function generateReadme(projectName: string): string {
  return `# ${projectName}

A graph workflow built with ADK-Rust, inspired by LangGraph.

## Features

- State-based workflow execution
- Conditional branching
- Cyclic graphs (revision loops)
- Type-safe state management

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

## Graph Architecture

\`\`\`
┌──────────┐     ┌───────┐     ┌────────┐
│ Research │ ──▶ │ Draft │ ──▶ │ Review │
└──────────┘     └───────┘     └────┬───┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               │               ▼
               ┌────────┐          │           ┌───────┐
               │ Revise │ ─────────┘           │  End  │
               └────────┘                      └───────┘
\`\`\`

## Customization

### Adding New Nodes

\`\`\`rust
.node("my_node", |state: &mut WorkflowState| async {
    // Node logic here
    Ok(())
})
\`\`\`

### Conditional Edges

\`\`\`rust
.conditional_edge("node_name", |state| {
    if some_condition { "next_node" } else { "other_node" }
})
\`\`\`

### Custom State

Define your own state struct with the fields your workflow needs:

\`\`\`rust
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MyState {
    input: String,
    intermediate: Vec<String>,
    output: Option<String>,
}
\`\`\`

## Project Structure

- \`src/main.rs\` - Graph workflow implementation
- \`.env\` - Environment variables (API keys)
- \`Cargo.toml\` - Rust dependencies

## Learn More

- [ADK-Rust Documentation](https://github.com/adk-rust/adk)
- [LangGraph Concepts](https://langchain-ai.github.io/langgraph/)
- [Gemini API Documentation](https://ai.google.dev/docs)
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
