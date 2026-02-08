/**
 * Integration tests for build flow.
 * Tests the build command with valid projects and error handling.
 * 
 * **Validates: Requirements 4.1-4.10**
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Import build runner functions directly for testing
import {
  constructCargoCommand,
  parseCargoOutput,
  loadEnvContent,
  loadEnvFile,
  validateBuildConfig,
  BuildConfig,
} from '../../buildRunner';

// Import project scaffolder for creating test projects
import { createProject, ProjectConfig } from '../../projectScaffolder';

suite('Build Flow Integration Tests', () => {
  let tempDir: string;

  setup(() => {
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-build-test-'));
  });

  teardown(() => {
    // Clean up temp directory after each test
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  suite('Cargo Command Construction', () => {
    test('constructs correct build command', () => {
      const config: BuildConfig = {
        projectPath: '/test/project',
        command: 'build',
        args: [],
        env: {},
      };

      const cmd = constructCargoCommand(config);

      assert.strictEqual(cmd.binary, 'cargo');
      assert.ok(cmd.args.includes('build'));
      assert.ok(cmd.args.includes('--manifest-path'));
      assert.ok(cmd.args.includes('/test/project/Cargo.toml'));
    });

    test('constructs correct run command', () => {
      const config: BuildConfig = {
        projectPath: '/test/project',
        command: 'run',
        args: [],
        env: {},
      };

      const cmd = constructCargoCommand(config);

      assert.strictEqual(cmd.binary, 'cargo');
      assert.ok(cmd.args.includes('run'));
    });

    test('includes additional arguments', () => {
      const config: BuildConfig = {
        projectPath: '/test/project',
        command: 'build',
        args: ['--release', '--verbose'],
        env: {},
      };

      const cmd = constructCargoCommand(config);

      assert.ok(cmd.args.includes('--release'));
      assert.ok(cmd.args.includes('--verbose'));
    });

    test('uses custom cargo path when provided', () => {
      const config: BuildConfig = {
        projectPath: '/test/project',
        command: 'build',
        args: [],
        env: {},
      };

      const cmd = constructCargoCommand(config, { cargoPath: '/custom/cargo' });

      assert.strictEqual(cmd.binary, '/custom/cargo');
    });

    test('merges environment variables', () => {
      const config: BuildConfig = {
        projectPath: '/test/project',
        command: 'build',
        args: [],
        env: { RUST_BACKTRACE: '1', CUSTOM_VAR: 'value' },
      };

      const cmd = constructCargoCommand(config);

      assert.strictEqual(cmd.env.RUST_BACKTRACE, '1');
      assert.strictEqual(cmd.env.CUSTOM_VAR, 'value');
    });

    test('sets correct working directory', () => {
      const config: BuildConfig = {
        projectPath: '/test/project',
        command: 'build',
        args: [],
        env: {},
      };

      const cmd = constructCargoCommand(config);

      assert.strictEqual(cmd.cwd, '/test/project');
    });
  });

  suite('Build Configuration Validation', () => {
    test('validates valid configuration', () => {
      const config: BuildConfig = {
        projectPath: '/test/project',
        command: 'build',
        args: [],
        env: {},
      };

      const errors = validateBuildConfig(config);

      assert.strictEqual(errors.length, 0);
    });

    test('rejects empty project path', () => {
      const config: BuildConfig = {
        projectPath: '',
        command: 'build',
        args: [],
        env: {},
      };

      const errors = validateBuildConfig(config);

      assert.ok(errors.length > 0);
      assert.ok(errors.some(e => e.includes('Project path')));
    });

    test('rejects invalid command', () => {
      const config = {
        projectPath: '/test/project',
        command: 'invalid' as 'build',
        args: [],
        env: {},
      };

      const errors = validateBuildConfig(config);

      assert.ok(errors.length > 0);
      assert.ok(errors.some(e => e.includes('Invalid command')));
    });
  });

  suite('Cargo Output Parsing', () => {
    test('parses error with code', () => {
      const output = `error[E0308]: mismatched types
 --> src/main.rs:10:5
  |
10 |     let x: i32 = "hello";
  |                  ^^^^^^^ expected i32, found &str`;

      const diagnostics = parseCargoOutput(output);

      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].severity, 'error');
      assert.strictEqual(diagnostics[0].code, 'E0308');
      assert.strictEqual(diagnostics[0].file, 'src/main.rs');
      assert.strictEqual(diagnostics[0].line, 10);
      assert.strictEqual(diagnostics[0].column, 5);
      assert.ok(diagnostics[0].message.includes('mismatched types'));
    });

    test('parses warning without code', () => {
      const output = `warning: unused variable: \`x\`
 --> src/main.rs:5:9
  |
5 |     let x = 42;
  |         ^ help: if this is intentional, prefix it with an underscore: \`_x\``;

      const diagnostics = parseCargoOutput(output);

      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].severity, 'warning');
      assert.strictEqual(diagnostics[0].code, null);
      assert.strictEqual(diagnostics[0].file, 'src/main.rs');
      assert.strictEqual(diagnostics[0].line, 5);
      assert.strictEqual(diagnostics[0].column, 9);
    });

    test('parses multiple diagnostics', () => {
      const output = `error[E0308]: mismatched types
 --> src/main.rs:10:5
  |
10 |     let x: i32 = "hello";
  |                  ^^^^^^^ expected i32, found &str

warning: unused variable: \`y\`
 --> src/lib.rs:20:9
  |
20 |     let y = 42;
  |         ^ help: prefix with underscore`;

      const diagnostics = parseCargoOutput(output);

      assert.strictEqual(diagnostics.length, 2);
      assert.strictEqual(diagnostics[0].severity, 'error');
      assert.strictEqual(diagnostics[0].file, 'src/main.rs');
      assert.strictEqual(diagnostics[1].severity, 'warning');
      assert.strictEqual(diagnostics[1].file, 'src/lib.rs');
    });

    test('handles empty output', () => {
      const diagnostics = parseCargoOutput('');

      assert.strictEqual(diagnostics.length, 0);
    });

    test('handles output with no diagnostics', () => {
      const output = `   Compiling my-project v0.1.0
    Finished dev [unoptimized + debuginfo] target(s) in 0.50s`;

      const diagnostics = parseCargoOutput(output);

      assert.strictEqual(diagnostics.length, 0);
    });
  });

  suite('.env File Parsing', () => {
    test('parses simple key-value pairs', () => {
      const content = `API_KEY=secret123
DATABASE_URL=postgres://localhost/db`;

      const env = loadEnvContent(content);

      assert.strictEqual(env.API_KEY, 'secret123');
      assert.strictEqual(env.DATABASE_URL, 'postgres://localhost/db');
    });

    test('ignores comments', () => {
      const content = `# This is a comment
API_KEY=secret123
# Another comment
DATABASE_URL=postgres://localhost/db`;

      const env = loadEnvContent(content);

      assert.strictEqual(Object.keys(env).length, 2);
      assert.strictEqual(env.API_KEY, 'secret123');
    });

    test('ignores empty lines', () => {
      const content = `API_KEY=secret123

DATABASE_URL=postgres://localhost/db

`;

      const env = loadEnvContent(content);

      assert.strictEqual(Object.keys(env).length, 2);
    });

    test('strips double quotes from values', () => {
      const content = `API_KEY="secret with spaces"`;

      const env = loadEnvContent(content);

      assert.strictEqual(env.API_KEY, 'secret with spaces');
    });

    test('strips single quotes from values', () => {
      const content = `API_KEY='secret with spaces'`;

      const env = loadEnvContent(content);

      assert.strictEqual(env.API_KEY, 'secret with spaces');
    });

    test('handles values with equals sign', () => {
      const content = `CONNECTION_STRING=host=localhost;port=5432`;

      const env = loadEnvContent(content);

      assert.strictEqual(env.CONNECTION_STRING, 'host=localhost;port=5432');
    });

    test('handles empty values', () => {
      const content = `EMPTY_VAR=`;

      const env = loadEnvContent(content);

      assert.strictEqual(env.EMPTY_VAR, '');
    });
  });

  suite('.env File Loading from Project', () => {
    test('loads .env file from project directory', async () => {
      // Create a test project
      const projectConfig: ProjectConfig = {
        name: 'env-load-test',
        template: 'simple-chat',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(projectConfig);

      const projectDir = path.join(tempDir, 'env-load-test');

      // Create a .env file
      const envContent = `GOOGLE_API_KEY=test-api-key
CUSTOM_VAR=custom-value`;
      fs.writeFileSync(path.join(projectDir, '.env'), envContent);

      // Load the .env file
      const env = loadEnvFile(projectDir);

      assert.strictEqual(env.GOOGLE_API_KEY, 'test-api-key');
      assert.strictEqual(env.CUSTOM_VAR, 'custom-value');
    });

    test('returns empty object when .env file does not exist', async () => {
      // Create a test project
      const projectConfig: ProjectConfig = {
        name: 'no-env-test',
        template: 'simple-chat',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(projectConfig);

      const projectDir = path.join(tempDir, 'no-env-test');

      // Don't create .env file, just load
      const env = loadEnvFile(projectDir);

      assert.deepStrictEqual(env, {});
    });
  });

  suite('Build with Generated Project', () => {
    test('constructs valid build command for generated project', async () => {
      // Create a test project
      const projectConfig: ProjectConfig = {
        name: 'build-test-project',
        template: 'simple-chat',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(projectConfig);

      const projectDir = path.join(tempDir, 'build-test-project');

      // Verify Cargo.toml exists
      assert.ok(fs.existsSync(path.join(projectDir, 'Cargo.toml')));

      // Construct build command
      const buildConfig: BuildConfig = {
        projectPath: projectDir,
        command: 'build',
        args: [],
        env: {},
      };

      const cmd = constructCargoCommand(buildConfig);

      // Verify command is correctly constructed
      assert.strictEqual(cmd.binary, 'cargo');
      assert.ok(cmd.args.includes('build'));
      assert.ok(cmd.args.includes('--manifest-path'));
      assert.ok(cmd.args.includes(path.join(projectDir, 'Cargo.toml')));
      assert.strictEqual(cmd.cwd, projectDir);
    });

    test('constructs valid run command for generated project', async () => {
      // Create a test project
      const projectConfig: ProjectConfig = {
        name: 'run-test-project',
        template: 'simple-chat',
        targetDir: tempDir,
        adkVersion: '0.1',
      };

      await createProject(projectConfig);

      const projectDir = path.join(tempDir, 'run-test-project');

      // Create .env file
      fs.writeFileSync(
        path.join(projectDir, '.env'),
        'GOOGLE_API_KEY=test-key'
      );

      // Construct run command
      const runConfig: BuildConfig = {
        projectPath: projectDir,
        command: 'run',
        args: [],
        env: {},
      };

      const cmd = constructCargoCommand(runConfig);

      // Verify command is correctly constructed
      assert.strictEqual(cmd.binary, 'cargo');
      assert.ok(cmd.args.includes('run'));
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

    test('adkRust.build command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(commands.includes('adkRust.build'), 'build command should be registered');
    });

    test('adkRust.run command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(commands.includes('adkRust.run'), 'run command should be registered');
    });
  });

  suite('Diagnostic Extraction', () => {
    test('extracts file path correctly', () => {
      const output = `error: cannot find value \`foo\` in this scope
 --> src/utils/helper.rs:25:10`;

      const diagnostics = parseCargoOutput(output);

      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].file, 'src/utils/helper.rs');
    });

    test('extracts line and column correctly', () => {
      const output = `error[E0425]: cannot find value \`bar\`
 --> src/main.rs:100:25`;

      const diagnostics = parseCargoOutput(output);

      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].line, 100);
      assert.strictEqual(diagnostics[0].column, 25);
    });

    test('handles various error codes', () => {
      const errorCodes = ['E0308', 'E0425', 'E0599', 'E0277', 'E0382'];

      for (const code of errorCodes) {
        const output = `error[${code}]: some error message
 --> src/main.rs:1:1`;

        const diagnostics = parseCargoOutput(output);

        assert.strictEqual(diagnostics.length, 1);
        assert.strictEqual(diagnostics[0].code, code);
      }
    });
  });
});
