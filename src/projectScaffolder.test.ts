/**
 * Property-based tests for Project Scaffolder.
 * 
 * Feature: adk-rust-extension
 * Property 4: Cargo.toml Generation
 * Property 5: Main.rs Generation
 * Property 6: Env Example Generation
 * 
 * **Validates: Requirements 2.2, 2.3, 2.4**
 */

import * as assert from 'assert';
import * as fc from 'fast-check';
import { generateCargoToml, generateMainRs, generateEnvExample, getTemplateMetadata, ProjectConfig } from './projectScaffolder';
import { TemplateType } from './configManager';
import { FC_CONFIG, projectNameArb, templateTypeArb, isValidTomlBasic, hasValidRustStructure } from './test/testUtils';

describe('ProjectScaffolder', () => {
  describe('generateCargoToml', () => {
    /**
     * Property 4: Cargo.toml Generation
     * 
     * For any template type and project name, the generated Cargo.toml SHALL contain
     * all required adk-rust crate dependencies for that template type, valid TOML syntax,
     * and the correct package name.
     * 
     * **Validates: Requirements 2.2**
     */
    it('Property 4: generates valid TOML with correct package name for any template and project name', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const config: ProjectConfig = {
              name: projectName,
              template,
              targetDir: '/tmp/test',
              adkVersion: '0.1',
            };

            const cargoToml = generateCargoToml(config);

            // Property: Output must be valid TOML syntax
            assert.ok(
              isValidTomlBasic(cargoToml),
              `Generated Cargo.toml should have valid TOML syntax for template "${template}" and project "${projectName}"`
            );

            // Property: Output must contain the correct package name
            assert.ok(
              cargoToml.includes(`name = "${projectName}"`),
              `Cargo.toml should contain package name "${projectName}"`
            );

            // Property: Output must contain [package] section
            assert.ok(
              cargoToml.includes('[package]'),
              'Cargo.toml should contain [package] section'
            );

            // Property: Output must contain [dependencies] section
            assert.ok(
              cargoToml.includes('[dependencies]'),
              'Cargo.toml should contain [dependencies] section'
            );

            // Property: Output must contain edition
            assert.ok(
              cargoToml.includes('edition = "2021"'),
              'Cargo.toml should specify Rust edition 2021'
            );

            // Property: Output must contain version
            assert.ok(
              cargoToml.includes('version = "0.1.0"'),
              'Cargo.toml should contain version'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 4: Cargo.toml contains required ADK crate dependencies for each template.
     * 
     * **Validates: Requirements 2.2**
     */
    it('Property 4: contains required ADK crate dependencies for each template type', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const config: ProjectConfig = {
              name: projectName,
              template,
              targetDir: '/tmp/test',
              adkVersion: '0.1',
            };

            const cargoToml = generateCargoToml(config);
            const metadata = getTemplateMetadata(template);

            // Property: All required ADK crates must be present in dependencies
            for (const crate of metadata.adkCrates) {
              assert.ok(
                cargoToml.includes(crate),
                `Cargo.toml for template "${template}" should contain dependency "${crate}"`
              );
            }
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 4: Cargo.toml contains common dependencies (tokio, dotenv).
     * 
     * **Validates: Requirements 2.2**
     */
    it('Property 4: contains common runtime dependencies for all templates', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const config: ProjectConfig = {
              name: projectName,
              template,
              targetDir: '/tmp/test',
              adkVersion: '0.1',
            };

            const cargoToml = generateCargoToml(config);

            // Property: All templates should include tokio for async runtime
            assert.ok(
              cargoToml.includes('tokio'),
              `Cargo.toml for template "${template}" should contain tokio dependency`
            );

            // Property: All templates should include dotenv for .env file loading
            assert.ok(
              cargoToml.includes('dotenv'),
              `Cargo.toml for template "${template}" should contain dotenv dependency`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 4: Cargo.toml structure is consistent across all templates.
     * 
     * **Validates: Requirements 2.2**
     */
    it('Property 4: maintains consistent structure across all templates', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const config: ProjectConfig = {
              name: projectName,
              template,
              targetDir: '/tmp/test',
              adkVersion: '0.1',
            };

            const cargoToml = generateCargoToml(config);
            const lines = cargoToml.split('\n');

            // Property: [package] section should come before [dependencies]
            const packageIndex = lines.findIndex(l => l.trim() === '[package]');
            const depsIndex = lines.findIndex(l => l.trim() === '[dependencies]');

            assert.ok(packageIndex >= 0, 'Should have [package] section');
            assert.ok(depsIndex >= 0, 'Should have [dependencies] section');
            assert.ok(
              packageIndex < depsIndex,
              '[package] section should come before [dependencies]'
            );

            // Property: Package name should be in [package] section (between [package] and [dependencies])
            const packageSection = lines.slice(packageIndex, depsIndex).join('\n');
            assert.ok(
              packageSection.includes(`name = "${projectName}"`),
              'Package name should be in [package] section'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 4: Template-specific dependencies are included correctly.
     * 
     * **Validates: Requirements 2.2**
     */
    it('Property 4: includes template-specific dependencies', async () => {
      // Test specific templates that have additional dependencies
      const templateSpecificDeps: Record<TemplateType, string[]> = {
        'simple-chat': [],
        'tool-using-agent': ['serde', 'serde_json'],
        'multi-agent-workflow': [],
        'graph-workflow': ['serde'],
      };

      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const config: ProjectConfig = {
              name: projectName,
              template,
              targetDir: '/tmp/test',
              adkVersion: '0.1',
            };

            const cargoToml = generateCargoToml(config);
            const specificDeps = templateSpecificDeps[template];

            // Property: Template-specific dependencies should be present
            for (const dep of specificDeps) {
              assert.ok(
                cargoToml.includes(dep),
                `Cargo.toml for template "${template}" should contain "${dep}" dependency`
              );
            }
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 4: Generated Cargo.toml is non-empty for any valid input.
     * 
     * **Validates: Requirements 2.2**
     */
    it('Property 4: generates non-empty output for any valid input', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const config: ProjectConfig = {
              name: projectName,
              template,
              targetDir: '/tmp/test',
              adkVersion: '0.1',
            };

            const cargoToml = generateCargoToml(config);

            // Property: Output must be non-empty
            assert.ok(cargoToml.length > 0, 'Cargo.toml should not be empty');

            // Property: Output must have multiple lines
            const lines = cargoToml.split('\n').filter(l => l.trim().length > 0);
            assert.ok(lines.length >= 5, 'Cargo.toml should have at least 5 non-empty lines');
          }
        ),
        FC_CONFIG
      );
    });
  });

  describe('generateMainRs', () => {
    /**
     * Property 5: Main.rs Generation
     * 
     * For any template type and project name, the generated src/main.rs SHALL contain
     * valid Rust syntax structure, import statements for required adk crates, and a main function.
     * 
     * **Validates: Requirements 2.3**
     */
    it('Property 5: generates valid Rust structure with main function for any template and project name', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const mainRs = generateMainRs(template, projectName);

            // Property: Output must have valid Rust structure
            assert.ok(
              hasValidRustStructure(mainRs),
              `Generated main.rs should have valid Rust structure for template "${template}" and project "${projectName}"`
            );

            // Property: Output must contain a main function
            assert.ok(
              /fn\s+main\s*\(/.test(mainRs),
              'main.rs should contain a main function'
            );

            // Property: Output must contain async main with tokio
            assert.ok(
              mainRs.includes('#[tokio::main]'),
              'main.rs should use #[tokio::main] attribute for async runtime'
            );

            // Property: Output must return Result type
            assert.ok(
              mainRs.includes('Result<(), Box<dyn std::error::Error>>'),
              'main function should return Result type'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 5: Main.rs contains required use statements for ADK.
     * 
     * **Validates: Requirements 2.3**
     */
    it('Property 5: contains required ADK import statements', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const mainRs = generateMainRs(template, projectName);

            // Property: All templates should import adk_rust prelude
            assert.ok(
              mainRs.includes('use adk_rust::prelude::*'),
              `main.rs for template "${template}" should import adk_rust::prelude`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 5: Main.rs loads environment variables from .env file.
     * 
     * **Validates: Requirements 2.3**
     */
    it('Property 5: loads environment variables from .env file', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const mainRs = generateMainRs(template, projectName);

            // Property: All templates should load .env file
            assert.ok(
              mainRs.includes('dotenv::dotenv()'),
              `main.rs for template "${template}" should load .env file`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 5: Main.rs has balanced braces (basic syntax validation).
     * 
     * **Validates: Requirements 2.3**
     */
    it('Property 5: has balanced braces for valid Rust syntax', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const mainRs = generateMainRs(template, projectName);

            // Property: Braces must be balanced
            const openBraces = (mainRs.match(/{/g) || []).length;
            const closeBraces = (mainRs.match(/}/g) || []).length;
            assert.strictEqual(
              openBraces,
              closeBraces,
              `main.rs should have balanced braces (open: ${openBraces}, close: ${closeBraces})`
            );

            // Property: Parentheses must be balanced
            const openParens = (mainRs.match(/\(/g) || []).length;
            const closeParens = (mainRs.match(/\)/g) || []).length;
            assert.strictEqual(
              openParens,
              closeParens,
              `main.rs should have balanced parentheses (open: ${openParens}, close: ${closeParens})`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 5: Main.rs contains documentation comment with project name.
     * 
     * **Validates: Requirements 2.3**
     */
    it('Property 5: contains documentation comment with project context', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const mainRs = generateMainRs(template, projectName);

            // Property: Should have module-level documentation
            assert.ok(
              mainRs.includes('//!'),
              'main.rs should contain module-level documentation comments'
            );

            // Property: Documentation should describe the agent type
            const templateDescriptions: Record<TemplateType, string> = {
              'simple-chat': 'chat',
              'tool-using-agent': 'tool',
              'multi-agent-workflow': 'multi-agent',
              'graph-workflow': 'graph',
            };
            const expectedDesc = templateDescriptions[template];
            assert.ok(
              mainRs.toLowerCase().includes(expectedDesc),
              `main.rs documentation should mention "${expectedDesc}" for template "${template}"`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 5: Main.rs creates an Agent with the correct model.
     * 
     * **Validates: Requirements 2.3**
     */
    it('Property 5: creates Agent with Gemini model', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const mainRs = generateMainRs(template, projectName);

            // Property: Should use Agent builder pattern
            assert.ok(
              mainRs.includes('Agent::builder()'),
              `main.rs for template "${template}" should use Agent::builder()`
            );

            // Property: Should specify a Gemini model
            assert.ok(
              mainRs.includes('gemini'),
              `main.rs for template "${template}" should use a Gemini model`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 5: Generated main.rs is non-empty for any valid input.
     * 
     * **Validates: Requirements 2.3**
     */
    it('Property 5: generates non-empty output for any valid input', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const mainRs = generateMainRs(template, projectName);

            // Property: Output must be non-empty
            assert.ok(mainRs.length > 0, 'main.rs should not be empty');

            // Property: Output must have multiple lines
            const lines = mainRs.split('\n').filter(l => l.trim().length > 0);
            assert.ok(lines.length >= 10, 'main.rs should have at least 10 non-empty lines');
          }
        ),
        FC_CONFIG
      );
    });
  });

  describe('generateEnvExample', () => {
    /**
     * Property 6: Env Example Generation
     * 
     * For any template type, the generated .env.example SHALL contain placeholder
     * entries for all API keys required by that template.
     * 
     * **Validates: Requirements 2.4**
     */
    it('Property 6: contains all required API keys for any template type', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          async (template: TemplateType) => {
            const envExample = generateEnvExample(template);
            const metadata = getTemplateMetadata(template);

            // Property: All required API keys must be present in .env.example
            for (const apiKey of metadata.requiredApiKeys) {
              assert.ok(
                envExample.includes(apiKey),
                `.env.example for template "${template}" should contain API key "${apiKey}"`
              );
            }
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 6: Env Example has valid KEY=value format.
     * 
     * **Validates: Requirements 2.4**
     */
    it('Property 6: generates valid KEY=value format for all API keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          async (template: TemplateType) => {
            const envExample = generateEnvExample(template);
            const metadata = getTemplateMetadata(template);

            // Property: Each required API key should have KEY=value format
            for (const apiKey of metadata.requiredApiKeys) {
              const keyValuePattern = new RegExp(`^${apiKey}=.+$`, 'm');
              assert.ok(
                keyValuePattern.test(envExample),
                `.env.example for template "${template}" should have "${apiKey}=value" format`
              );
            }
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 6: Env Example is non-empty for any template.
     * 
     * **Validates: Requirements 2.4**
     */
    it('Property 6: generates non-empty output for any template', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          async (template: TemplateType) => {
            const envExample = generateEnvExample(template);

            // Property: Output must be non-empty
            assert.ok(envExample.length > 0, '.env.example should not be empty');

            // Property: Output must have at least one non-comment, non-empty line
            const contentLines = envExample.split('\n').filter(
              l => l.trim().length > 0 && !l.trim().startsWith('#')
            );
            assert.ok(
              contentLines.length >= 1,
              '.env.example should have at least one key-value line'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 6: Env Example contains helpful comments.
     * 
     * **Validates: Requirements 2.4**
     */
    it('Property 6: contains helpful comments for API keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          async (template: TemplateType) => {
            const envExample = generateEnvExample(template);

            // Property: Should contain comment lines (documentation)
            const commentLines = envExample.split('\n').filter(l => l.trim().startsWith('#'));
            assert.ok(
              commentLines.length >= 1,
              `.env.example for template "${template}" should contain at least one comment line`
            );
          }
        ),
        FC_CONFIG
      );
    });
  });
});


  describe('generateReadme', () => {
    /**
     * Property 7: README Generation
     * 
     * For any project configuration, the generated README.md SHALL contain
     * non-empty setup instructions and the project name.
     * 
     * **Validates: Requirements 2.6**
     */
    it('Property 7: contains project name for any project configuration', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const config: ProjectConfig = {
              name: projectName,
              template,
              targetDir: '/tmp/test',
              adkVersion: '0.1',
            };

            const { generateReadme } = await import('./projectScaffolder');
            const readme = generateReadme(config);

            // Property: README must contain the project name
            assert.ok(
              readme.includes(projectName),
              `README should contain project name "${projectName}"`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 7: README contains setup instructions.
     * 
     * **Validates: Requirements 2.6**
     */
    it('Property 7: contains setup instructions for any template', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const config: ProjectConfig = {
              name: projectName,
              template,
              targetDir: '/tmp/test',
              adkVersion: '0.1',
            };

            const { generateReadme } = await import('./projectScaffolder');
            const readme = generateReadme(config);

            // Property: README must contain setup section
            const hasSetup = readme.toLowerCase().includes('setup') || 
                            readme.toLowerCase().includes('getting started') ||
                            readme.toLowerCase().includes('installation');
            assert.ok(
              hasSetup,
              `README for template "${template}" should contain setup instructions`
            );

            // Property: README must mention cargo run
            assert.ok(
              readme.includes('cargo run'),
              `README for template "${template}" should mention cargo run`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 7: README contains .env setup instructions.
     * 
     * **Validates: Requirements 2.6**
     */
    it('Property 7: contains .env setup instructions', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const config: ProjectConfig = {
              name: projectName,
              template,
              targetDir: '/tmp/test',
              adkVersion: '0.1',
            };

            const { generateReadme } = await import('./projectScaffolder');
            const readme = generateReadme(config);

            // Property: README must mention .env file setup
            assert.ok(
              readme.includes('.env'),
              `README for template "${template}" should mention .env file`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 7: README is non-empty and has meaningful content.
     * 
     * **Validates: Requirements 2.6**
     */
    it('Property 7: generates non-empty output with meaningful content', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const config: ProjectConfig = {
              name: projectName,
              template,
              targetDir: '/tmp/test',
              adkVersion: '0.1',
            };

            const { generateReadme } = await import('./projectScaffolder');
            const readme = generateReadme(config);

            // Property: Output must be non-empty
            assert.ok(readme.length > 0, 'README should not be empty');

            // Property: Output must have multiple lines
            const lines = readme.split('\n').filter(l => l.trim().length > 0);
            assert.ok(lines.length >= 5, 'README should have at least 5 non-empty lines');

            // Property: README should start with a heading containing project name
            assert.ok(
              readme.startsWith('#'),
              'README should start with a markdown heading'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 7: README contains project structure information.
     * 
     * **Validates: Requirements 2.6**
     */
    it('Property 7: contains project structure information', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateTypeArb,
          projectNameArb,
          async (template: TemplateType, projectName: string) => {
            const config: ProjectConfig = {
              name: projectName,
              template,
              targetDir: '/tmp/test',
              adkVersion: '0.1',
            };

            const { generateReadme } = await import('./projectScaffolder');
            const readme = generateReadme(config);

            // Property: README should mention key files
            assert.ok(
              readme.includes('Cargo.toml') || readme.includes('main.rs'),
              `README for template "${template}" should mention project files`
            );
          }
        ),
        FC_CONFIG
      );
    });
  });
