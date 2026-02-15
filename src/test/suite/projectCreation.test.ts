/**
 * Integration tests for project creation flow.
 * Tests the create project command end-to-end.
 * 
 * **Validates: Requirements 2.1-2.9**
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Import scaffolder functions directly for testing
import {
  createProject,
  getTemplates,
  getTemplateDescription,
  ProjectConfig,
} from '../../projectScaffolder';

suite('Project Creation Integration Tests', () => {
  let tempDir: string;

  setup(() => {
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-test-'));
  });

  teardown(() => {
    // Clean up temp directory after each test
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  suite('Project Scaffolder Direct Tests', () => {
    test('createProject generates all required files for simple-chat template', async () => {
      const config: ProjectConfig = {
        name: 'test-simple-chat',
        template: 'simple-chat',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(config);

      const projectDir = path.join(tempDir, 'test-simple-chat');

      // Verify project directory was created
      assert.ok(fs.existsSync(projectDir), 'Project directory should exist');

      // Verify all required files exist
      const requiredFiles = [
        'Cargo.toml',
        'src/main.rs',
        '.env.example',
        'README.md',
        '.gitignore',
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(projectDir, file);
        assert.ok(fs.existsSync(filePath), `${file} should exist`);
      }
    });

    test('createProject generates all required files for tool-using-agent template', async () => {
      const config: ProjectConfig = {
        name: 'test-tool-agent',
        template: 'tool-using-agent',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(config);

      const projectDir = path.join(tempDir, 'test-tool-agent');

      // Verify all required files exist
      const requiredFiles = [
        'Cargo.toml',
        'src/main.rs',
        '.env.example',
        'README.md',
        '.gitignore',
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(projectDir, file);
        assert.ok(fs.existsSync(filePath), `${file} should exist for tool-using-agent`);
      }
    });

    test('createProject generates all required files for multi-agent-workflow template', async () => {
      const config: ProjectConfig = {
        name: 'test-multi-agent',
        template: 'multi-agent-workflow',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(config);

      const projectDir = path.join(tempDir, 'test-multi-agent');

      // Verify all required files exist
      const requiredFiles = [
        'Cargo.toml',
        'src/main.rs',
        '.env.example',
        'README.md',
        '.gitignore',
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(projectDir, file);
        assert.ok(fs.existsSync(filePath), `${file} should exist for multi-agent-workflow`);
      }
    });

    test('createProject generates all required files for graph-workflow template', async () => {
      const config: ProjectConfig = {
        name: 'test-graph-workflow',
        template: 'graph-workflow',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(config);

      const projectDir = path.join(tempDir, 'test-graph-workflow');

      // Verify all required files exist
      const requiredFiles = [
        'Cargo.toml',
        'src/main.rs',
        '.env.example',
        'README.md',
        '.gitignore',
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(projectDir, file);
        assert.ok(fs.existsSync(filePath), `${file} should exist for graph-workflow`);
      }
    });

    test('Cargo.toml contains correct package name', async () => {
      const config: ProjectConfig = {
        name: 'my-test-project',
        template: 'simple-chat',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(config);

      const cargoPath = path.join(tempDir, 'my-test-project', 'Cargo.toml');
      const content = fs.readFileSync(cargoPath, 'utf-8');

      assert.ok(content.includes('name = "my-test-project"'), 'Cargo.toml should contain correct package name');
      assert.ok(content.includes('[package]'), 'Cargo.toml should have [package] section');
      assert.ok(content.includes('[dependencies]'), 'Cargo.toml should have [dependencies] section');
    });

    test('Cargo.toml contains required ADK dependencies', async () => {
      const config: ProjectConfig = {
        name: 'dep-test-project',
        template: 'simple-chat',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(config);

      const cargoPath = path.join(tempDir, 'dep-test-project', 'Cargo.toml');
      const content = fs.readFileSync(cargoPath, 'utf-8');

      // Check for required dependencies
      assert.ok(content.includes('adk'), 'Cargo.toml should contain adk dependency');
      assert.ok(content.includes('tokio'), 'Cargo.toml should contain tokio dependency');
      assert.ok(content.includes('dotenv'), 'Cargo.toml should contain dotenv dependency');
    });

    test('main.rs contains valid Rust structure', async () => {
      const config: ProjectConfig = {
        name: 'rust-test-project',
        template: 'simple-chat',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(config);

      const mainPath = path.join(tempDir, 'rust-test-project', 'src', 'main.rs');
      const content = fs.readFileSync(mainPath, 'utf-8');

      // Check for required Rust elements
      assert.ok(content.includes('fn main'), 'main.rs should contain main function');
      assert.ok(content.includes('#[tokio::main]'), 'main.rs should use tokio::main attribute');
      assert.ok(content.includes('use adk_rust::prelude::*'), 'main.rs should import adk prelude');
      assert.ok(content.includes('dotenvy::dotenv()'), 'main.rs should load .env file');
      assert.ok(content.includes('LlmAgentBuilder::new('), 'main.rs should create an Agent');
    });

    test('.env.example contains required API keys', async () => {
      const config: ProjectConfig = {
        name: 'env-test-project',
        template: 'simple-chat',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(config);

      const envPath = path.join(tempDir, 'env-test-project', '.env.example');
      const content = fs.readFileSync(envPath, 'utf-8');

      // Check for required API key
      assert.ok(content.includes('GOOGLE_API_KEY'), '.env.example should contain GOOGLE_API_KEY');
    });

    test('README.md contains project name and setup instructions', async () => {
      const config: ProjectConfig = {
        name: 'readme-test-project',
        template: 'simple-chat',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(config);

      const readmePath = path.join(tempDir, 'readme-test-project', 'README.md');
      const content = fs.readFileSync(readmePath, 'utf-8');

      // Check for project name and setup instructions
      assert.ok(content.includes('readme-test-project'), 'README should contain project name');
      assert.ok(content.includes('Setup') || content.includes('setup'), 'README should contain setup instructions');
      assert.ok(content.includes('cargo run'), 'README should mention cargo run');
    });

    test('createProject throws error for existing directory', async () => {
      const config: ProjectConfig = {
        name: 'existing-project',
        template: 'simple-chat',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      // Create the project first
      await createProject(config);

      // Try to create again - should throw
      await assert.rejects(
        async () => createProject(config),
        /already exists/,
        'Should throw error for existing directory'
      );
    });

    test('createProject validates project name', async () => {
      // Test invalid project name starting with number
      const invalidConfig: ProjectConfig = {
        name: '123-invalid',
        template: 'simple-chat',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await assert.rejects(
        async () => createProject(invalidConfig),
        /must start with a letter/,
        'Should reject project name starting with number'
      );
    });

    test('tool-using-agent template includes additional dependencies', async () => {
      const config: ProjectConfig = {
        name: 'tool-deps-test',
        template: 'tool-using-agent',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(config);

      const cargoPath = path.join(tempDir, 'tool-deps-test', 'Cargo.toml');
      const content = fs.readFileSync(cargoPath, 'utf-8');

      // Tool-using agent should have serde for JSON handling
      assert.ok(content.includes('serde'), 'tool-using-agent should include serde');
    });

    test('tool-using-agent .env.example includes API key', async () => {
      const config: ProjectConfig = {
        name: 'tool-env-test',
        template: 'tool-using-agent',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(config);

      const envPath = path.join(tempDir, 'tool-env-test', '.env.example');
      const content = fs.readFileSync(envPath, 'utf-8');

      // Tool-using agent needs Google API key
      assert.ok(content.includes('GOOGLE_API_KEY'), '.env.example should contain GOOGLE_API_KEY');
    });
  });

  suite('Template Functions', () => {
    test('getTemplates returns all four template types', () => {
      const templates = getTemplates();
      assert.strictEqual(templates.length, 4, 'Should have 4 templates');
      assert.ok(templates.includes('simple-chat'), 'Should include simple-chat');
      assert.ok(templates.includes('tool-using-agent'), 'Should include tool-using-agent');
      assert.ok(templates.includes('multi-agent-workflow'), 'Should include multi-agent-workflow');
      assert.ok(templates.includes('graph-workflow'), 'Should include graph-workflow');
    });

    test('getTemplateDescription returns non-empty descriptions', () => {
      const templates = getTemplates();
      for (const template of templates) {
        const description = getTemplateDescription(template);
        assert.ok(description.length > 0, `${template} should have a description`);
      }
    });
  });

  suite('VS Code Command Integration', () => {
    suiteSetup(async () => {
      // Ensure extension is activated before checking commands
      const ext = vscode.extensions.getExtension('zavora-ai.adk-rust-extension');
      if (ext && !ext.isActive) {
        await ext.activate();
      }
      // Give VS Code a moment to register all commands
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('adkRust.createProject command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(commands.includes('adkRust.createProject'), 'createProject command should be registered');
    });
  });
});
