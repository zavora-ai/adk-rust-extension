/**
 * Unit tests and Property-based tests for Project Tree Provider.
 *
 * Feature: adk-rust-extension
 * Property 13: ADK Project Detection
 *
 * **Validates: Requirements 7.1-7.5**
 */

import * as assert from 'assert';
import * as fc from 'fast-check';
import {
  isAdkProject,
  parseProjectName,
  detectAgentType,
  parseAgentsFromContent,
  ADK_CRATE_NAMES
} from './projectTreeProvider';
import { FC_CONFIG, projectNameArb } from './test/testUtils';

describe('ProjectTreeProvider', () => {
  describe('isAdkProject', () => {
    it('returns true for Cargo.toml with adk-core dependency', () => {
      const cargoToml = `
[package]
name = "my-agent"
version = "0.1.0"
edition = "2021"

[dependencies]
adk-core = "0.1"
tokio = { version = "1", features = ["full"] }
`;
      assert.strictEqual(isAdkProject(cargoToml), true);
    });

    it('returns true for Cargo.toml with adk-agent dependency', () => {
      const cargoToml = `
[package]
name = "my-agent"
version = "0.1.0"

[dependencies]
adk-agent = "0.1"
`;
      assert.strictEqual(isAdkProject(cargoToml), true);
    });

    it('returns true for Cargo.toml with multiple adk dependencies', () => {
      const cargoToml = `
[package]
name = "my-agent"

[dependencies]
adk-core = "0.1"
adk-agent = "0.1"
adk-model = "0.1"
adk-runner = "0.1"
`;
      assert.strictEqual(isAdkProject(cargoToml), true);
    });

    it('returns true for adk dependencies with underscores', () => {
      const cargoToml = `
[dependencies]
adk_core = "0.1"
`;
      assert.strictEqual(isAdkProject(cargoToml), true);
    });

    it('returns false for Cargo.toml without adk dependencies', () => {
      const cargoToml = `
[package]
name = "regular-project"
version = "0.1.0"

[dependencies]
tokio = "1"
serde = "1"
`;
      assert.strictEqual(isAdkProject(cargoToml), false);
    });

    it('returns false for empty Cargo.toml', () => {
      assert.strictEqual(isAdkProject(''), false);
    });

    it('returns false for Cargo.toml with similar but non-adk dependencies', () => {
      const cargoToml = `
[dependencies]
sdk-core = "0.1"
my-adk = "0.1"
`;
      assert.strictEqual(isAdkProject(cargoToml), false);
    });

    it('returns true for Cargo.toml with adk-rust = "0.2"', () => {
      const cargoToml = `
[package]
name = "my-agent"
version = "0.1.0"
edition = "2021"

[dependencies]
adk-rust = "0.2"
tokio = { version = "1", features = ["full"] }
`;
      assert.strictEqual(isAdkProject(cargoToml), true);
    });

    it('returns true for Cargo.toml with adk-core = { version = "0.2" }', () => {
      const cargoToml = `
[package]
name = "my-agent"
version = "0.1.0"
edition = "2021"

[dependencies]
adk-core = { version = "0.2" }
`;
      assert.strictEqual(isAdkProject(cargoToml), true);
    });

    it('returns false for Cargo.toml with unrelated crate only', () => {
      const cargoToml = `
[package]
name = "not-adk"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
reqwest = "0.11"
`;
      assert.strictEqual(isAdkProject(cargoToml), false);
    });
  });

  describe('parseProjectName', () => {
    it('extracts project name from valid Cargo.toml', () => {
      const cargoToml = `
[package]
name = "my-awesome-agent"
version = "0.1.0"
`;
      assert.strictEqual(parseProjectName(cargoToml), 'my-awesome-agent');
    });

    it('extracts project name with underscores', () => {
      const cargoToml = `
[package]
name = "my_agent_project"
version = "0.1.0"
`;
      assert.strictEqual(parseProjectName(cargoToml), 'my_agent_project');
    });

    it('returns null for Cargo.toml without name', () => {
      const cargoToml = `
[package]
version = "0.1.0"
`;
      assert.strictEqual(parseProjectName(cargoToml), null);
    });

    it('returns null for empty content', () => {
      assert.strictEqual(parseProjectName(''), null);
    });

    it('handles name with spaces around equals sign', () => {
      const cargoToml = `
[package]
name   =   "spaced-name"
`;
      assert.strictEqual(parseProjectName(cargoToml), 'spaced-name');
    });
  });

  describe('detectAgentType', () => {
    it('detects graph agent type', () => {
      const context = 'let agent = Agent::builder().graph_workflow()';
      assert.strictEqual(detectAgentType(context), 'graph');
    });

    it('detects workflow as graph type', () => {
      const context = 'Creating a workflow agent';
      assert.strictEqual(detectAgentType(context), 'graph');
    });

    it('detects sequential agent type', () => {
      const context = 'let agent = Agent::builder().sequential()';
      assert.strictEqual(detectAgentType(context), 'sequential');
    });

    it('detects sequence as sequential type', () => {
      const context = 'Running agents in sequence';
      assert.strictEqual(detectAgentType(context), 'sequential');
    });

    it('detects parallel agent type', () => {
      const context = 'let agent = Agent::builder().parallel()';
      assert.strictEqual(detectAgentType(context), 'parallel');
    });

    it('detects loop agent type', () => {
      const context = 'let agent = Agent::builder().loop_until()';
      assert.strictEqual(detectAgentType(context), 'loop');
    });

    it('detects while as loop type', () => {
      const context = 'while condition { agent.run() }';
      assert.strictEqual(detectAgentType(context), 'loop');
    });

    it('defaults to llm for basic agent', () => {
      const context = 'let agent = Agent::builder().name("chat")';
      assert.strictEqual(detectAgentType(context), 'llm');
    });

    it('defaults to llm for empty context', () => {
      assert.strictEqual(detectAgentType(''), 'llm');
    });

    it('is case insensitive', () => {
      assert.strictEqual(detectAgentType('GRAPH'), 'graph');
      assert.strictEqual(detectAgentType('Sequential'), 'sequential');
      assert.strictEqual(detectAgentType('PARALLEL'), 'parallel');
    });
  });

  describe('parseAgentsFromContent', () => {
    it('parses agent from simple Agent::builder() call', () => {
      const content = `
use adk::prelude::*;

#[tokio::main]
async fn main() {
    let agent = Agent::builder()
        .name("my-chat-agent")
        .build();
}
`;
      const agents = parseAgentsFromContent('/test/main.rs', content);

      assert.strictEqual(agents.length, 1);
      assert.strictEqual(agents[0].name, 'my-chat-agent');
      assert.strictEqual(agents[0].type, 'llm');
      assert.strictEqual(agents[0].filePath, '/test/main.rs');
    });

    it('parses multiple agents from file', () => {
      const content = `
use adk::prelude::*;

fn create_agents() {
    let chat = Agent::builder()
        .name("chat-agent")
        .build();

    let search = Agent::builder()
        .name("search-agent")
        .build();
}
`;
      const agents = parseAgentsFromContent('/test/agents.rs', content);

      assert.strictEqual(agents.length, 2);
      assert.strictEqual(agents[0].name, 'chat-agent');
      assert.strictEqual(agents[1].name, 'search-agent');
    });

    it('detects agent type from context', () => {
      const content = `
use adk::prelude::*;

fn create_graph() {
    // Creating a graph agent
    let graph_agent = Agent::builder()
        .name("graph-workflow")
        .graph()
        .build();
}
`;
      const agents = parseAgentsFromContent('/test/workflow.rs', content);

      assert.strictEqual(agents.length, 1);
      assert.strictEqual(agents[0].name, 'graph-workflow');
      assert.strictEqual(agents[0].type, 'graph');
    });

    it('uses variable name when .name() is not found', () => {
      const content = `
fn main() {
    let my_custom_agent = Agent::builder()
        .model("gemini")
        .build();
}
`;
      const agents = parseAgentsFromContent('/test/main.rs', content);

      assert.strictEqual(agents.length, 1);
      assert.strictEqual(agents[0].name, 'my_custom_agent');
    });

    it('returns empty array for file without agents', () => {
      const content = `
use std::io;

fn main() {
    println!("Hello, world!");
}
`;
      const agents = parseAgentsFromContent('/test/main.rs', content);

      assert.strictEqual(agents.length, 0);
    });

    it('returns empty array for empty content', () => {
      const agents = parseAgentsFromContent('/test/empty.rs', '');
      assert.strictEqual(agents.length, 0);
    });

    it('captures correct line numbers', () => {
      const content = `line 1
line 2
line 3
let agent = Agent::builder()
    .name("test")
    .build();
`;
      const agents = parseAgentsFromContent('/test/main.rs', content);

      assert.strictEqual(agents.length, 1);
      assert.strictEqual(agents[0].line, 4);
    });

    it('handles Agent::builder() with spaces', () => {
      const content = `
let agent = Agent::builder  ()
    .name("spaced")
    .build();
`;
      const agents = parseAgentsFromContent('/test/main.rs', content);

      assert.strictEqual(agents.length, 1);
      assert.strictEqual(agents[0].name, 'spaced');
    });

    it('detects sequential agent from context', () => {
      const content = `
// Sequential agent workflow
let seq = Agent::builder()
    .name("sequential-agent")
    .sequential()
    .build();
`;
      const agents = parseAgentsFromContent('/test/main.rs', content);

      assert.strictEqual(agents.length, 1);
      assert.strictEqual(agents[0].type, 'sequential');
    });

    it('detects parallel agent from context', () => {
      const content = `
// Parallel execution
let par = Agent::builder()
    .name("parallel-agent")
    .parallel()
    .build();
`;
      const agents = parseAgentsFromContent('/test/main.rs', content);

      assert.strictEqual(agents.length, 1);
      assert.strictEqual(agents[0].type, 'parallel');
    });
  });
});


/**
 * Arbitrary for generating valid ADK crate names.
 * Picks from the explicit ADK_CRATE_NAMES list and optionally generates
 * the underscore variant (e.g. `adk_rust` for `adk-rust`) since Cargo
 * normalizes hyphens to underscores.
 */
const adkCrateNameArb = fc.tuple(
  fc.constantFrom(...ADK_CRATE_NAMES),
  fc.boolean()
).map(([crate, useUnderscore]) =>
  useUnderscore ? crate.replace(/-/g, '_') : crate
);

/**
 * Set of all known ADK crate names including both hyphen and underscore variants.
 * Used to filter out ADK crates from the non-ADK generator.
 */
const ALL_ADK_VARIANTS = new Set(
  ADK_CRATE_NAMES.flatMap(name => [name, name.replace(/-/g, '_')])
);

/**
 * Arbitrary for generating non-ADK crate names.
 * These should NOT match any known ADK crate name (hyphen or underscore variant).
 */
const nonAdkCrateNameArb = fc.stringMatching(/^[a-z][a-z0-9_-]{1,20}$/)
  .filter(name => !ALL_ADK_VARIANTS.has(name));

/**
 * Arbitrary for generating a complete Cargo.toml with ADK dependencies.
 */
const adkCargoTomlArb = fc.tuple(
  projectNameArb,
  fc.array(adkCrateNameArb, { minLength: 1, maxLength: 5 }),
  fc.array(nonAdkCrateNameArb, { minLength: 0, maxLength: 5 })
).map(([projectName, adkCrates, otherCrates]) => {
  const uniqueAdkCrates = [...new Set(adkCrates)];
  const uniqueOtherCrates = [...new Set(otherCrates)].filter(c => !uniqueAdkCrates.includes(c));
  
  const allDeps = [
    ...uniqueAdkCrates.map(c => `${c} = "0.1"`),
    ...uniqueOtherCrates.map(c => `${c} = "1.0"`)
  ];
  
  return {
    content: `[package]
name = "${projectName}"
version = "0.1.0"
edition = "2021"

[dependencies]
${allDeps.join('\n')}
`,
    projectName,
    adkCrates: uniqueAdkCrates,
    otherCrates: uniqueOtherCrates,
    isAdk: true
  };
});

/**
 * Arbitrary for generating a Cargo.toml WITHOUT ADK dependencies.
 */
const nonAdkCargoTomlArb = fc.tuple(
  projectNameArb,
  fc.array(nonAdkCrateNameArb, { minLength: 0, maxLength: 10 })
).map(([projectName, crates]) => {
  const uniqueCrates = [...new Set(crates)];
  const deps = uniqueCrates.map(c => `${c} = "1.0"`).join('\n');
  
  return {
    content: `[package]
name = "${projectName}"
version = "0.1.0"
edition = "2021"

[dependencies]
${deps}
`,
    projectName,
    crates: uniqueCrates,
    isAdk: false
  };
});

describe('ProjectTreeProvider - Property-Based Tests', () => {
  /**
   * Property 13: ADK Project Detection
   *
   * For any Cargo.toml content, the project detector SHALL correctly identify
   * whether it is an ADK project by checking for adk-* crate dependencies.
   *
   * **Validates: Requirements 7.1**
   */
  describe('isAdkProject - Property 13', () => {
    /**
     * Property 13: Cargo.toml with ADK dependencies is correctly identified as ADK project.
     *
     * **Validates: Requirements 7.1**
     */
    it('Property 13: correctly identifies Cargo.toml with ADK dependencies as ADK project', async () => {
      await fc.assert(
        fc.asyncProperty(adkCargoTomlArb, async ({ content, adkCrates }) => {
          const result = isAdkProject(content);

          // Property: Any Cargo.toml with adk-* or adk_* dependencies should be identified as ADK project
          assert.strictEqual(
            result,
            true,
            `Cargo.toml with ADK crates [${adkCrates.join(', ')}] should be identified as ADK project`
          );
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 13: Cargo.toml without ADK dependencies is correctly identified as non-ADK project.
     *
     * **Validates: Requirements 7.1**
     */
    it('Property 13: correctly identifies Cargo.toml without ADK dependencies as non-ADK project', async () => {
      await fc.assert(
        fc.asyncProperty(nonAdkCargoTomlArb, async ({ content, crates }) => {
          const result = isAdkProject(content);

          // Property: Cargo.toml without adk-* or adk_* dependencies should NOT be identified as ADK project
          assert.strictEqual(
            result,
            false,
            `Cargo.toml with non-ADK crates [${crates.join(', ')}] should NOT be identified as ADK project`
          );
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 13: Detection is consistent regardless of dependency order or formatting.
     *
     * **Validates: Requirements 7.1**
     */
    it('Property 13: detection is consistent regardless of dependency order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(adkCrateNameArb, { minLength: 1, maxLength: 5 }),
          fc.array(nonAdkCrateNameArb, { minLength: 0, maxLength: 5 }),
          fc.integer({ min: 0, max: 1000 }),  // seed for shuffling
          async (adkCrates, otherCrates, seed) => {
            const uniqueAdkCrates = [...new Set(adkCrates)];
            const uniqueOtherCrates = [...new Set(otherCrates)].filter(c => !uniqueAdkCrates.includes(c));
            
            // Create all dependencies and shuffle them deterministically
            const allDeps = [
              ...uniqueAdkCrates.map(c => `${c} = "0.1"`),
              ...uniqueOtherCrates.map(c => `${c} = "1.0"`)
            ];
            
            // Shuffle deterministically using a seeded Fisher-Yates pass.
            let shuffleState = (seed >>> 0) || 1;
            const shuffled = [...allDeps];
            for (let i = shuffled.length - 1; i > 0; i--) {
              shuffleState = (shuffleState * 1664525 + 1013904223) >>> 0;
              const j = shuffleState % (i + 1);
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            
            const content = `[package]
name = "test-project"
version = "0.1.0"

[dependencies]
${shuffled.join('\n')}
`;
            
            const result = isAdkProject(content);

            // Property: Detection should work regardless of dependency order
            assert.strictEqual(
              result,
              true,
              'ADK project detection should work regardless of dependency order'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 13: Detection handles both hyphen and underscore separators.
     *
     * **Validates: Requirements 7.1**
     */
    it('Property 13: correctly handles both adk- and adk_ prefixes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...ADK_CRATE_NAMES),
          fc.boolean(),
          async (crate, useUnderscore) => {
            const crateName = useUnderscore ? crate.replace(/-/g, '_') : crate;
            const content = `[dependencies]\n${crateName} = "0.1"`;

            const result = isAdkProject(content);

            // Property: Both adk- and adk_ prefixes should be recognized
            assert.strictEqual(
              result,
              true,
              `Crate "${crateName}" should be recognized as ADK dependency`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 13: Empty or minimal Cargo.toml is correctly identified as non-ADK.
     *
     * **Validates: Requirements 7.1**
     */
    it('Property 13: empty or minimal Cargo.toml is identified as non-ADK project', async () => {
      const minimalCargoTomlArb = fc.constantFrom(
        '',
        '[package]',
        '[package]\nname = "test"',
        '[dependencies]',
        '# Just a comment'
      );

      await fc.assert(
        fc.asyncProperty(minimalCargoTomlArb, async (content) => {
          const result = isAdkProject(content);

          // Property: Minimal/empty Cargo.toml should not be identified as ADK project
          assert.strictEqual(
            result,
            false,
            'Empty or minimal Cargo.toml should not be identified as ADK project'
          );
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 13: Similar but non-ADK crate names are not falsely detected.
     *
     * **Validates: Requirements 7.1**
     */
    it('Property 13: similar but non-ADK crate names are not falsely detected', async () => {
      // Crate names that look similar to ADK but shouldn't match
      // Note: Names like "pre-adk-core" DO match because they contain "adk-core" as a word
      const similarNonAdkCrateArb = fc.constantFrom(
        'sdk-core',
        'my-adk',
        'adk',  // Just "adk" without suffix
        'adklib',  // No separator
        'adk123',  // No separator
        'ADK-core',  // Wrong case
        'Adk-core',  // Wrong case
        'adkcore',  // No separator
        'myadk-core'  // "adk" not at word boundary
      );

      await fc.assert(
        fc.asyncProperty(similarNonAdkCrateArb, async (crateName) => {
          const content = `[dependencies]\n${crateName} = "0.1"`;

          const result = isAdkProject(content);

          // Property: Similar but non-ADK crate names should not be detected
          assert.strictEqual(
            result,
            false,
            `Crate "${crateName}" should NOT be recognized as ADK dependency`
          );
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 13: Detection works with various Cargo.toml formatting styles.
     *
     * **Validates: Requirements 7.1**
     */
    it('Property 13: detection works with various dependency formatting styles', async () => {
      const adkCrateArb = fc.constantFrom('adk-core', 'adk-agent', 'adk_model', 'adk-runner');
      const formattingStyleArb = fc.constantFrom(
        (crate: string) => `${crate} = "0.1"`,
        (crate: string) => `${crate} = { version = "0.1" }`,
        (crate: string) => `${crate} = { version = "0.1", features = ["full"] }`,
        (crate: string) => `${crate}="0.1"`,  // No spaces
        (crate: string) => `${crate}   =   "0.1"`,  // Extra spaces
        (crate: string) => `${crate} = { git = "https://github.com/example/adk" }`
      );

      await fc.assert(
        fc.asyncProperty(
          adkCrateArb,
          formattingStyleArb,
          async (crate, formatFn) => {
            const depLine = formatFn(crate);
            const content = `[package]\nname = "test"\n\n[dependencies]\n${depLine}`;

            const result = isAdkProject(content);

            // Property: Detection should work regardless of formatting style
            assert.strictEqual(
              result,
              true,
              `ADK crate "${crate}" with formatting "${depLine}" should be detected`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 13: isAdkProject returns boolean for any input.
     *
     * **Validates: Requirements 7.1**
     */
    it('Property 13: always returns boolean for any input string', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 1000 }),
          async (content) => {
            const result = isAdkProject(content);

            // Property: Result must always be a boolean
            assert.strictEqual(
              typeof result,
              'boolean',
              'isAdkProject should always return a boolean'
            );
          }
        ),
        FC_CONFIG
      );
    });
  });

  describe('parseProjectName - Property Tests', () => {
    /**
     * Property: parseProjectName correctly extracts project name from valid Cargo.toml.
     *
     * **Validates: Requirements 7.1**
     */
    it('correctly extracts project name from any valid Cargo.toml', async () => {
      await fc.assert(
        fc.asyncProperty(projectNameArb, async (projectName) => {
          const content = `[package]\nname = "${projectName}"\nversion = "0.1.0"`;

          const result = parseProjectName(content);

          // Property: Extracted name should match the input name
          assert.strictEqual(
            result,
            projectName,
            `parseProjectName should extract "${projectName}" from Cargo.toml`
          );
        }),
        FC_CONFIG
      );
    });

    /**
     * Property: parseProjectName returns null for Cargo.toml without name.
     *
     * **Validates: Requirements 7.1**
     */
    it('returns null for Cargo.toml without name field', async () => {
      const noNameCargoTomlArb = fc.constantFrom(
        '',
        '[package]',
        '[package]\nversion = "0.1.0"',
        '[dependencies]\ntokio = "1"',
        '# Just a comment'
      );

      await fc.assert(
        fc.asyncProperty(noNameCargoTomlArb, async (content) => {
          const result = parseProjectName(content);

          // Property: Should return null when name is not present
          assert.strictEqual(
            result,
            null,
            'parseProjectName should return null when name field is missing'
          );
        }),
        FC_CONFIG
      );
    });
  });
});
