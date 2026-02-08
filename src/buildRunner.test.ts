/**
 * Property-based tests for Build Runner.
 * 
 * Feature: adk-rust-extension
 * Property 10: Cargo Command Construction
 * Property 11: Cargo Error Output Parsing
 * Property 12: Env File Parsing for Process Environment
 * 
 * **Validates: Requirements 4.1, 4.2, 4.4, 4.10**
 */

import * as assert from 'assert';
import * as fc from 'fast-check';
import * as path from 'path';
import { 
  constructCargoCommand, 
  validateBuildConfig, 
  parseCargoOutput,
  loadEnvContent,
  BuildConfig, 
  CargoCommand
} from './buildRunner';
import { FC_CONFIG, cargoErrorArb, CargoErrorInfo } from './test/testUtils';

/**
 * Arbitrary for generating valid cargo commands.
 */
const cargoCommandArb = fc.constantFrom('build', 'run', 'check', 'test') as fc.Arbitrary<'build' | 'run' | 'check' | 'test'>;

/**
 * Arbitrary for generating valid project paths.
 */
const projectPathArb = fc.stringMatching(/^\/[a-zA-Z0-9_/-]{1,50}$/).filter(p => !p.includes('//'));

/**
 * Arbitrary for generating cargo arguments.
 */
const cargoArgsArb = fc.array(
  fc.constantFrom('--release', '--verbose', '--quiet', '--jobs', '4', '--target', 'x86_64-unknown-linux-gnu'),
  { minLength: 0, maxLength: 5 }
);

/**
 * Arbitrary for generating environment variables.
 */
const envVarsArb = fc.dictionary(
  fc.stringMatching(/^[A-Z][A-Z0-9_]{0,20}$/),
  fc.string({ minLength: 0, maxLength: 50 }).filter(s => !s.includes('\n')),
  { minKeys: 0, maxKeys: 5 }
);

/**
 * Arbitrary for generating complete build configurations.
 */
const buildConfigArb = fc.record({
  projectPath: projectPathArb,
  command: cargoCommandArb,
  args: cargoArgsArb,
  env: envVarsArb
}) as fc.Arbitrary<BuildConfig>;

describe('BuildRunner', () => {
  describe('constructCargoCommand', () => {
    /**
     * Property 10: Cargo Command Construction
     * 
     * For any build configuration (project path, command type, arguments),
     * the Build_Runner SHALL construct the correct cargo command with
     * proper working directory and arguments.
     * 
     * **Validates: Requirements 4.1, 4.2**
     */
    it('Property 10: constructs correct cargo command for any valid build configuration', async () => {
      await fc.assert(
        fc.asyncProperty(buildConfigArb, async (config: BuildConfig) => {
          const cmd = constructCargoCommand(config);
          
          // Property: Binary should be 'cargo' by default
          assert.strictEqual(cmd.binary, 'cargo', 'Binary should be cargo');
          
          // Property: First argument should be the command
          assert.strictEqual(cmd.args[0], config.command, 'First arg should be the command');
          
          // Property: Working directory should be the project path
          assert.strictEqual(cmd.cwd, config.projectPath, 'Working directory should match project path');
          
          // Property: Result should be a valid CargoCommand
          assertValidCargoCommand(cmd);
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 10: Manifest path is correctly included in arguments.
     * 
     * **Validates: Requirements 4.1, 4.2**
     */
    it('Property 10: includes manifest path in arguments', async () => {
      await fc.assert(
        fc.asyncProperty(buildConfigArb, async (config: BuildConfig) => {
          const cmd = constructCargoCommand(config);
          
          // Property: Arguments should include --manifest-path
          const manifestIndex = cmd.args.indexOf('--manifest-path');
          assert.ok(manifestIndex >= 0, 'Should include --manifest-path flag');
          
          // Property: Manifest path should point to Cargo.toml in project directory
          const expectedManifestPath = path.join(config.projectPath, 'Cargo.toml');
          assert.strictEqual(
            cmd.args[manifestIndex + 1],
            expectedManifestPath,
            'Manifest path should point to Cargo.toml'
          );
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 10: Additional arguments are preserved in order.
     * 
     * **Validates: Requirements 4.1, 4.2**
     */
    it('Property 10: preserves additional arguments in order', async () => {
      await fc.assert(
        fc.asyncProperty(buildConfigArb, async (config: BuildConfig) => {
          const cmd = constructCargoCommand(config);
          
          // Property: All additional args should be present
          for (const arg of config.args) {
            assert.ok(
              cmd.args.includes(arg),
              `Argument "${arg}" should be present in command`
            );
          }
          
          // Property: Additional args should appear after manifest path
          const manifestIndex = cmd.args.indexOf('--manifest-path');
          const manifestPathIndex = manifestIndex + 1;
          
          for (const arg of config.args) {
            const argIndex = cmd.args.indexOf(arg);
            assert.ok(
              argIndex > manifestPathIndex,
              `Argument "${arg}" should appear after manifest path`
            );
          }
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 10: Environment variables are included in command.
     * 
     * **Validates: Requirements 4.1, 4.2**
     */
    it('Property 10: includes environment variables in command', async () => {
      await fc.assert(
        fc.asyncProperty(buildConfigArb, async (config: BuildConfig) => {
          const cmd = constructCargoCommand(config);
          
          // Property: All config env vars should be present in command env
          for (const [key, value] of Object.entries(config.env)) {
            assert.strictEqual(
              cmd.env[key],
              value,
              `Environment variable "${key}" should be present with correct value`
            );
          }
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 10: Custom cargo path is used when provided.
     * 
     * **Validates: Requirements 4.1, 4.2**
     */
    it('Property 10: uses custom cargo path when provided', async () => {
      const customCargoPathArb = fc.stringMatching(/^\/[a-zA-Z0-9_/-]{1,30}\/cargo$/);
      
      await fc.assert(
        fc.asyncProperty(
          buildConfigArb,
          customCargoPathArb,
          async (config: BuildConfig, customPath: string) => {
            const cmd = constructCargoCommand(config, { cargoPath: customPath });
            
            // Property: Binary should be the custom path
            assert.strictEqual(cmd.binary, customPath, 'Binary should be custom cargo path');
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 10: Command structure is consistent for all command types.
     * 
     * **Validates: Requirements 4.1, 4.2**
     */
    it('Property 10: maintains consistent structure for all command types', async () => {
      await fc.assert(
        fc.asyncProperty(
          cargoCommandArb,
          projectPathArb,
          async (command, projectPath) => {
            const config: BuildConfig = {
              projectPath,
              command,
              args: [],
              env: {}
            };
            
            const cmd = constructCargoCommand(config);
            
            // Property: Structure should be: [command, --manifest-path, path]
            assert.strictEqual(cmd.args.length, 3, 'Should have exactly 3 args for minimal config');
            assert.strictEqual(cmd.args[0], command, 'First arg should be command');
            assert.strictEqual(cmd.args[1], '--manifest-path', 'Second arg should be --manifest-path');
            assert.ok(cmd.args[2].endsWith('Cargo.toml'), 'Third arg should be manifest path');
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 10: Arguments array is never mutated.
     * 
     * **Validates: Requirements 4.1, 4.2**
     */
    it('Property 10: does not mutate input configuration', async () => {
      await fc.assert(
        fc.asyncProperty(buildConfigArb, async (config: BuildConfig) => {
          // Deep copy the original args
          const originalArgs = [...config.args];
          const originalEnv = { ...config.env };
          
          constructCargoCommand(config);
          
          // Property: Original args should not be mutated
          assert.deepStrictEqual(config.args, originalArgs, 'Args should not be mutated');
          assert.deepStrictEqual(config.env, originalEnv, 'Env should not be mutated');
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 10: Empty args array is handled correctly.
     * 
     * **Validates: Requirements 4.1, 4.2**
     */
    it('Property 10: handles empty args array correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          cargoCommandArb,
          projectPathArb,
          async (command, projectPath) => {
            const config: BuildConfig = {
              projectPath,
              command,
              args: [],
              env: {}
            };
            
            const cmd = constructCargoCommand(config);
            
            // Property: Should still have command and manifest path
            assert.ok(cmd.args.length >= 3, 'Should have at least command and manifest path');
            assert.strictEqual(cmd.args[0], command, 'First arg should be command');
          }
        ),
        FC_CONFIG
      );
    });
  });

  describe('validateBuildConfig', () => {
    /**
     * Property 10: Valid configurations pass validation.
     * 
     * **Validates: Requirements 4.1, 4.2**
     */
    it('Property 10: valid configurations pass validation', async () => {
      await fc.assert(
        fc.asyncProperty(buildConfigArb, async (config: BuildConfig) => {
          const errors = validateBuildConfig(config);
          
          // Property: Valid config should have no errors
          assert.strictEqual(errors.length, 0, `Valid config should have no errors, got: ${errors.join(', ')}`);
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 10: Empty project path fails validation.
     * 
     * **Validates: Requirements 4.1, 4.2**
     */
    it('Property 10: empty project path fails validation', async () => {
      await fc.assert(
        fc.asyncProperty(cargoCommandArb, async (command) => {
          const config: BuildConfig = {
            projectPath: '',
            command,
            args: [],
            env: {}
          };
          
          const errors = validateBuildConfig(config);
          
          // Property: Should have validation error
          assert.ok(errors.length > 0, 'Empty project path should fail validation');
          assert.ok(
            errors.some(e => e.toLowerCase().includes('path')),
            'Error should mention path'
          );
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 10: Invalid command fails validation.
     * 
     * **Validates: Requirements 4.1, 4.2**
     */
    it('Property 10: invalid command fails validation', async () => {
      const invalidCommandArb = fc.string({ minLength: 1, maxLength: 20 })
        .filter(s => !['build', 'run', 'check', 'test'].includes(s));
      
      await fc.assert(
        fc.asyncProperty(
          projectPathArb,
          invalidCommandArb,
          async (projectPath, invalidCommand) => {
            const config = {
              projectPath,
              command: invalidCommand as 'build',
              args: [],
              env: {}
            };
            
            const errors = validateBuildConfig(config);
            
            // Property: Should have validation error
            assert.ok(errors.length > 0, 'Invalid command should fail validation');
            assert.ok(
              errors.some(e => e.toLowerCase().includes('command')),
              'Error should mention command'
            );
          }
        ),
        FC_CONFIG
      );
    });
  });
});

/**
 * Asserts that a value is a valid CargoCommand object.
 */
function assertValidCargoCommand(cmd: CargoCommand): void {
  assert.strictEqual(typeof cmd, 'object', 'Command must be an object');
  assert.strictEqual(typeof cmd.binary, 'string', 'binary must be string');
  assert.ok(cmd.binary.length > 0, 'binary must not be empty');
  assert.ok(Array.isArray(cmd.args), 'args must be an array');
  assert.ok(cmd.args.length > 0, 'args must not be empty');
  assert.strictEqual(typeof cmd.cwd, 'string', 'cwd must be string');
  assert.strictEqual(typeof cmd.env, 'object', 'env must be an object');
}


/**
 * Generates a cargo error output string from diagnostic info.
 * 
 * @param diagnostic - Diagnostic information
 * @returns Formatted cargo error output string
 */
function generateCargoErrorOutput(diagnostic: CargoErrorInfo): string {
  const codeStr = diagnostic.code ? `[${diagnostic.code}]` : '';
  return `${diagnostic.severity}${codeStr}: ${diagnostic.message}
 --> ${diagnostic.file}:${diagnostic.line}:${diagnostic.column}
  |
${diagnostic.line} | some code here
  | ^^^^^ ${diagnostic.message}`;
}

/**
 * Generates multiple cargo error outputs combined.
 */
function generateMultipleCargoErrors(diagnostics: CargoErrorInfo[]): string {
  return diagnostics.map(generateCargoErrorOutput).join('\n\n');
}

describe('BuildRunner - parseCargoOutput', () => {
  /**
   * Property 11: Cargo Error Output Parsing
   * 
   * For any cargo error output string containing compiler errors,
   * the parser SHALL extract diagnostics with correct file paths,
   * line numbers, column numbers, severity levels, and error messages.
   * 
   * **Validates: Requirements 4.4**
   */
  describe('Property 11: Cargo Error Output Parsing', () => {
    /**
     * Property 11: Single error is parsed correctly.
     * 
     * **Validates: Requirements 4.4**
     */
    it('Property 11: parses single error with correct file, line, column, severity', async () => {
      await fc.assert(
        fc.asyncProperty(cargoErrorArb, async (errorInfo) => {
          const output = generateCargoErrorOutput(errorInfo);
          const diagnostics = parseCargoOutput(output);
          
          // Property: Should extract exactly one diagnostic
          assert.strictEqual(diagnostics.length, 1, 'Should extract exactly one diagnostic');
          
          const diag = diagnostics[0];
          
          // Property: File path should match
          assert.strictEqual(diag.file, errorInfo.file, 'File path should match');
          
          // Property: Line number should match
          assert.strictEqual(diag.line, errorInfo.line, 'Line number should match');
          
          // Property: Column number should match
          assert.strictEqual(diag.column, errorInfo.column, 'Column number should match');
          
          // Property: Severity should match
          assert.strictEqual(diag.severity, errorInfo.severity, 'Severity should match');
          
          // Property: Message should match
          assert.strictEqual(diag.message, errorInfo.message, 'Message should match');
          
          // Property: Code should match (null if undefined)
          assert.strictEqual(diag.code, errorInfo.code || null, 'Error code should match');
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 11: Multiple errors are all parsed correctly.
     * 
     * **Validates: Requirements 4.4**
     */
    it('Property 11: parses multiple errors correctly', async () => {
      const multipleErrorsArb = fc.array(cargoErrorArb, { minLength: 1, maxLength: 5 });
      
      await fc.assert(
        fc.asyncProperty(multipleErrorsArb, async (errors) => {
          const output = generateMultipleCargoErrors(errors);
          const diagnostics = parseCargoOutput(output);
          
          // Property: Should extract correct number of diagnostics
          assert.strictEqual(
            diagnostics.length, 
            errors.length, 
            `Should extract ${errors.length} diagnostics, got ${diagnostics.length}`
          );
          
          // Property: Each diagnostic should have correct data
          for (let i = 0; i < errors.length; i++) {
            const expected = errors[i];
            const actual = diagnostics[i];
            
            assert.strictEqual(actual.file, expected.file, `Diagnostic ${i}: file should match`);
            assert.strictEqual(actual.line, expected.line, `Diagnostic ${i}: line should match`);
            assert.strictEqual(actual.column, expected.column, `Diagnostic ${i}: column should match`);
            assert.strictEqual(actual.severity, expected.severity, `Diagnostic ${i}: severity should match`);
          }
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 11: Error codes are correctly extracted when present.
     * 
     * **Validates: Requirements 4.4**
     */
    it('Property 11: extracts error codes correctly when present', async () => {
      const errorWithCodeArb = fc.record({
        file: fc.stringMatching(/^[a-zA-Z0-9_/-]+\.rs$/),
        line: fc.integer({ min: 1, max: 10000 }),
        column: fc.integer({ min: 1, max: 500 }),
        severity: fc.constant('error' as const),
        message: fc.string({ minLength: 1, maxLength: 200 }),
        code: fc.stringMatching(/^E[0-9]{4}$/)
      });
      
      await fc.assert(
        fc.asyncProperty(errorWithCodeArb, async (errorInfo) => {
          const output = generateCargoErrorOutput(errorInfo);
          const diagnostics = parseCargoOutput(output);
          
          assert.strictEqual(diagnostics.length, 1, 'Should extract one diagnostic');
          assert.strictEqual(diagnostics[0].code, errorInfo.code, 'Error code should be extracted');
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 11: Warnings are parsed with correct severity.
     * 
     * **Validates: Requirements 4.4**
     */
    it('Property 11: parses warnings with correct severity', async () => {
      const warningArb = fc.record({
        file: fc.stringMatching(/^[a-zA-Z0-9_/-]+\.rs$/),
        line: fc.integer({ min: 1, max: 10000 }),
        column: fc.integer({ min: 1, max: 500 }),
        severity: fc.constant('warning' as const),
        message: fc.string({ minLength: 1, maxLength: 200 }),
        code: fc.option(fc.stringMatching(/^E[0-9]{4}$/), { nil: undefined })
      });
      
      await fc.assert(
        fc.asyncProperty(warningArb, async (warningInfo) => {
          const output = generateCargoErrorOutput(warningInfo);
          const diagnostics = parseCargoOutput(output);
          
          assert.strictEqual(diagnostics.length, 1, 'Should extract one diagnostic');
          assert.strictEqual(diagnostics[0].severity, 'warning', 'Severity should be warning');
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 11: Empty output returns empty diagnostics array.
     * 
     * **Validates: Requirements 4.4**
     */
    it('Property 11: returns empty array for empty output', async () => {
      const diagnostics = parseCargoOutput('');
      assert.strictEqual(diagnostics.length, 0, 'Empty output should return empty array');
    });

    /**
     * Property 11: Output without errors returns empty diagnostics array.
     * 
     * **Validates: Requirements 4.4**
     */
    it('Property 11: returns empty array for output without errors', async () => {
      const nonErrorOutputArb = fc.array(
        fc.stringMatching(/^[a-zA-Z0-9 ]+$/),
        { minLength: 1, maxLength: 10 }
      ).map(lines => lines.join('\n'));
      
      await fc.assert(
        fc.asyncProperty(nonErrorOutputArb, async (output) => {
          const diagnostics = parseCargoOutput(output);
          
          // Property: Non-error output should return empty array
          assert.strictEqual(diagnostics.length, 0, 'Non-error output should return empty array');
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 11: Line and column numbers are always positive integers.
     * 
     * **Validates: Requirements 4.4**
     */
    it('Property 11: line and column numbers are always positive integers', async () => {
      await fc.assert(
        fc.asyncProperty(cargoErrorArb, async (errorInfo) => {
          const output = generateCargoErrorOutput(errorInfo);
          const diagnostics = parseCargoOutput(output);
          
          for (const diag of diagnostics) {
            // Property: Line should be positive integer
            assert.ok(Number.isInteger(diag.line), 'Line should be an integer');
            assert.ok(diag.line > 0, 'Line should be positive');
            
            // Property: Column should be positive integer
            assert.ok(Number.isInteger(diag.column), 'Column should be an integer');
            assert.ok(diag.column > 0, 'Column should be positive');
          }
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 11: Severity is always 'error' or 'warning'.
     * 
     * **Validates: Requirements 4.4**
     */
    it('Property 11: severity is always error or warning', async () => {
      await fc.assert(
        fc.asyncProperty(cargoErrorArb, async (errorInfo) => {
          const output = generateCargoErrorOutput(errorInfo);
          const diagnostics = parseCargoOutput(output);
          
          for (const diag of diagnostics) {
            // Property: Severity should be one of the valid values
            assert.ok(
              diag.severity === 'error' || diag.severity === 'warning',
              `Severity should be 'error' or 'warning', got '${diag.severity}'`
            );
          }
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 11: File paths are non-empty strings.
     * 
     * **Validates: Requirements 4.4**
     */
    it('Property 11: file paths are non-empty strings', async () => {
      await fc.assert(
        fc.asyncProperty(cargoErrorArb, async (errorInfo) => {
          const output = generateCargoErrorOutput(errorInfo);
          const diagnostics = parseCargoOutput(output);
          
          for (const diag of diagnostics) {
            // Property: File should be non-empty string
            assert.strictEqual(typeof diag.file, 'string', 'File should be a string');
            assert.ok(diag.file.length > 0, 'File should not be empty');
          }
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 11: Messages are non-empty strings.
     * 
     * **Validates: Requirements 4.4**
     */
    it('Property 11: messages are non-empty strings', async () => {
      await fc.assert(
        fc.asyncProperty(cargoErrorArb, async (errorInfo) => {
          const output = generateCargoErrorOutput(errorInfo);
          const diagnostics = parseCargoOutput(output);
          
          for (const diag of diagnostics) {
            // Property: Message should be non-empty string
            assert.strictEqual(typeof diag.message, 'string', 'Message should be a string');
            assert.ok(diag.message.length > 0, 'Message should not be empty');
          }
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 11: Error code is either null or matches E#### pattern.
     * 
     * **Validates: Requirements 4.4**
     */
    it('Property 11: error code is null or matches E#### pattern', async () => {
      await fc.assert(
        fc.asyncProperty(cargoErrorArb, async (errorInfo) => {
          const output = generateCargoErrorOutput(errorInfo);
          const diagnostics = parseCargoOutput(output);
          
          for (const diag of diagnostics) {
            // Property: Code should be null or match pattern
            if (diag.code !== null) {
              assert.ok(
                /^E\d{4}$/.test(diag.code),
                `Error code should match E#### pattern, got '${diag.code}'`
              );
            }
          }
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 11: Diagnostics maintain order from input.
     * 
     * **Validates: Requirements 4.4**
     */
    it('Property 11: diagnostics maintain order from input', async () => {
      const orderedErrorsArb = fc.array(cargoErrorArb, { minLength: 2, maxLength: 5 });
      
      await fc.assert(
        fc.asyncProperty(orderedErrorsArb, async (errors) => {
          const output = generateMultipleCargoErrors(errors);
          const diagnostics = parseCargoOutput(output);
          
          // Property: Diagnostics should be in same order as input
          for (let i = 0; i < Math.min(errors.length, diagnostics.length); i++) {
            assert.strictEqual(
              diagnostics[i].file,
              errors[i].file,
              `Diagnostic ${i} should maintain order`
            );
          }
        }),
        FC_CONFIG
      );
    });
  });
});


/**
 * Arbitrary for generating valid .env variable names.
 * Must start with a letter and contain only uppercase letters, digits, and underscores.
 */
const envKeyArb = fc.stringMatching(/^[A-Z][A-Z0-9_]{0,30}$/);

/**
 * Arbitrary for generating .env values (simple unquoted values).
 * Filters out values that start and end with quotes to avoid quote-stripping behavior.
 */
const envValueArb = fc.string({ minLength: 0, maxLength: 100 })
  .filter(s => !s.includes('\n') && !s.includes('\r'))
  .filter(s => {
    // Filter out values that would be interpreted as quoted values
    if (s.length >= 2) {
      if ((s.startsWith('"') && s.endsWith('"')) ||
          (s.startsWith("'") && s.endsWith("'"))) {
        return false;
      }
    }
    return true;
  });

/**
 * Arbitrary for generating .env key-value pairs.
 */
const envPairArb = fc.record({
  key: envKeyArb,
  value: envValueArb
});

/**
 * Arbitrary for generating comment lines.
 */
const commentLineArb = fc.string({ minLength: 0, maxLength: 50 })
  .filter(s => !s.includes('\n'))
  .map(s => `# ${s}`);

/**
 * Arbitrary for generating empty or whitespace-only lines.
 */
const emptyLineArb = fc.constantFrom('', '  ', '\t', '   \t  ');

describe('BuildRunner - loadEnvContent', () => {
  /**
   * Property 12: Env File Parsing for Process Environment
   * 
   * For any .env file content with KEY=VALUE pairs, the parser SHALL
   * correctly extract all key-value pairs and handle edge cases
   * (comments, empty lines, quoted values).
   * 
   * **Validates: Requirements 4.10**
   */
  describe('Property 12: Env File Parsing for Process Environment', () => {
    /**
     * Property 12: Basic key-value pairs are correctly extracted.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: extracts basic key-value pairs correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(envPairArb, { minLength: 1, maxLength: 10 }),
          async (pairs) => {
            // Create .env content with unique keys
            const uniquePairs = pairs.reduce((acc, pair) => {
              if (!acc.some(p => p.key === pair.key)) {
                acc.push(pair);
              }
              return acc;
            }, [] as typeof pairs);
            
            const content = uniquePairs.map(p => `${p.key}=${p.value}`).join('\n');
            const result = loadEnvContent(content);
            
            // Property: All keys should be present
            for (const pair of uniquePairs) {
              assert.ok(
                pair.key in result,
                `Key "${pair.key}" should be present in result`
              );
            }
            
            // Property: Values should match
            for (const pair of uniquePairs) {
              assert.strictEqual(
                result[pair.key],
                pair.value,
                `Value for "${pair.key}" should match`
              );
            }
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 12: Empty content returns empty object.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: returns empty object for empty content', async () => {
      const result = loadEnvContent('');
      assert.deepStrictEqual(result, {}, 'Empty content should return empty object');
    });

    /**
     * Property 12: Comment lines are ignored.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: ignores comment lines', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(commentLineArb, { minLength: 1, maxLength: 5 }),
          envPairArb,
          async (comments, pair) => {
            // Mix comments with a valid key-value pair
            const lines = [...comments, `${pair.key}=${pair.value}`, ...comments];
            const content = lines.join('\n');
            const result = loadEnvContent(content);
            
            // Property: Only the key-value pair should be extracted
            assert.strictEqual(
              Object.keys(result).length,
              1,
              'Should only extract the key-value pair, not comments'
            );
            assert.strictEqual(
              result[pair.key],
              pair.value,
              'Value should be correctly extracted'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 12: Empty lines are ignored.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: ignores empty lines', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(emptyLineArb, { minLength: 1, maxLength: 5 }),
          envPairArb,
          async (emptyLines, pair) => {
            // Mix empty lines with a valid key-value pair
            const lines = [...emptyLines, `${pair.key}=${pair.value}`, ...emptyLines];
            const content = lines.join('\n');
            const result = loadEnvContent(content);
            
            // Property: Only the key-value pair should be extracted
            assert.strictEqual(
              Object.keys(result).length,
              1,
              'Should only extract the key-value pair, not empty lines'
            );
            assert.strictEqual(
              result[pair.key],
              pair.value,
              'Value should be correctly extracted'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 12: Double-quoted values have quotes stripped.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: strips double quotes from values', async () => {
      await fc.assert(
        fc.asyncProperty(
          envKeyArb,
          envValueArb.filter(v => !v.includes('"')),
          async (key, value) => {
            const content = `${key}="${value}"`;
            const result = loadEnvContent(content);
            
            // Property: Quotes should be stripped
            assert.strictEqual(
              result[key],
              value,
              'Double quotes should be stripped from value'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 12: Single-quoted values have quotes stripped.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: strips single quotes from values', async () => {
      await fc.assert(
        fc.asyncProperty(
          envKeyArb,
          envValueArb.filter(v => !v.includes("'")),
          async (key, value) => {
            const content = `${key}='${value}'`;
            const result = loadEnvContent(content);
            
            // Property: Quotes should be stripped
            assert.strictEqual(
              result[key],
              value,
              'Single quotes should be stripped from value'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 12: Empty values are handled correctly.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: handles empty values correctly', async () => {
      await fc.assert(
        fc.asyncProperty(envKeyArb, async (key) => {
          const content = `${key}=`;
          const result = loadEnvContent(content);
          
          // Property: Empty value should be empty string
          assert.strictEqual(
            result[key],
            '',
            'Empty value should be empty string'
          );
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 12: Values with equals signs are handled correctly.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: handles values containing equals signs', async () => {
      await fc.assert(
        fc.asyncProperty(
          envKeyArb,
          fc.tuple(envValueArb, envValueArb).map(([a, b]) => `${a}=${b}`)
            .filter(v => {
              // Filter out combined values that look like quoted strings
              if (v.length >= 2) {
                if ((v.startsWith('"') && v.endsWith('"')) ||
                    (v.startsWith("'") && v.endsWith("'"))) {
                  return false;
                }
              }
              return true;
            }),
          async (key, valueWithEquals) => {
            const content = `${key}=${valueWithEquals}`;
            const result = loadEnvContent(content);
            
            // Property: Value should include everything after first equals
            assert.strictEqual(
              result[key],
              valueWithEquals,
              'Value should include equals signs'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 12: Result keys are always strings.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: result keys are always strings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(envPairArb, { minLength: 1, maxLength: 10 }),
          async (pairs) => {
            const content = pairs.map(p => `${p.key}=${p.value}`).join('\n');
            const result = loadEnvContent(content);
            
            // Property: All keys should be strings
            for (const key of Object.keys(result)) {
              assert.strictEqual(
                typeof key,
                'string',
                'All keys should be strings'
              );
            }
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 12: Result values are always strings.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: result values are always strings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(envPairArb, { minLength: 1, maxLength: 10 }),
          async (pairs) => {
            const content = pairs.map(p => `${p.key}=${p.value}`).join('\n');
            const result = loadEnvContent(content);
            
            // Property: All values should be strings
            for (const value of Object.values(result)) {
              assert.strictEqual(
                typeof value,
                'string',
                'All values should be strings'
              );
            }
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 12: Later values override earlier ones for duplicate keys.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: later values override earlier ones for duplicate keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          envKeyArb,
          envValueArb,
          envValueArb,
          async (key, value1, value2) => {
            const content = `${key}=${value1}\n${key}=${value2}`;
            const result = loadEnvContent(content);
            
            // Property: Later value should win
            assert.strictEqual(
              result[key],
              value2,
              'Later value should override earlier one'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 12: Mixed content (comments, empty lines, values) is parsed correctly.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: handles mixed content correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.oneof(
              commentLineArb,
              emptyLineArb,
              envPairArb.map(p => ({ type: 'pair' as const, ...p }))
            ),
            { minLength: 1, maxLength: 15 }
          ),
          async (lines) => {
            // Build content and track expected pairs
            const contentLines: string[] = [];
            const expectedPairs: Record<string, string> = {};
            
            for (const line of lines) {
              if (typeof line === 'string') {
                contentLines.push(line);
              } else if ('type' in line && line.type === 'pair') {
                contentLines.push(`${line.key}=${line.value}`);
                expectedPairs[line.key] = line.value;
              }
            }
            
            const content = contentLines.join('\n');
            const result = loadEnvContent(content);
            
            // Property: All expected pairs should be present
            for (const [key, value] of Object.entries(expectedPairs)) {
              assert.strictEqual(
                result[key],
                value,
                `Key "${key}" should have correct value`
              );
            }
            
            // Property: No extra keys should be present
            assert.strictEqual(
              Object.keys(result).length,
              Object.keys(expectedPairs).length,
              'Should have exactly the expected number of keys'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 12: Lowercase keys are handled correctly.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: handles lowercase keys correctly', async () => {
      const lowercaseKeyArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,30}$/);
      
      await fc.assert(
        fc.asyncProperty(
          lowercaseKeyArb,
          envValueArb,
          async (key, value) => {
            const content = `${key}=${value}`;
            const result = loadEnvContent(content);
            
            // Property: Lowercase keys should be extracted
            assert.strictEqual(
              result[key],
              value,
              'Lowercase keys should be handled correctly'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 12: Keys starting with underscore after first char are valid.
     * 
     * **Validates: Requirements 4.10**
     */
    it('Property 12: handles keys with underscores correctly', async () => {
      const underscoreKeyArb = fc.stringMatching(/^[A-Z][A-Z0-9]*_[A-Z0-9_]{0,20}$/);
      
      await fc.assert(
        fc.asyncProperty(
          underscoreKeyArb,
          envValueArb,
          async (key, value) => {
            const content = `${key}=${value}`;
            const result = loadEnvContent(content);
            
            // Property: Keys with underscores should be extracted
            assert.strictEqual(
              result[key],
              value,
              'Keys with underscores should be handled correctly'
            );
          }
        ),
        FC_CONFIG
      );
    });
  });
});
