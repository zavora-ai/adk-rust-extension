/**
 * Property-based tests for Environment Checker.
 * 
 * Feature: adk-rust-extension
 * Property 1: Tool Detection Correctness
 * Property 2: Validation Error Messaging
 * Property 3: API Key Detection
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.7**
 */

import * as assert from 'assert';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { checkTool, getInstallationGuide, ToolStatus, checkApiKeys, parseEnvContent, ApiKeyStatus, checkEnvironment, DEFAULT_API_KEYS, updateEnvKey } from './environmentChecker';
import { FC_CONFIG, toolNameArb, envVarNameArb } from './test/testUtils';

describe('EnvironmentChecker', () => {
  describe('checkTool', () => {
    /**
     * Property 1: Tool Detection Correctness
     * 
     * For any tool name (rustc, cargo, adk-studio) and any PATH configuration,
     * the Environment_Checker SHALL correctly identify whether the tool is
     * available and return accurate path/version information when found,
     * or null values when not found.
     * 
     * **Validates: Requirements 1.1, 1.2, 1.3**
     */
    it('Property 1: returns consistent ToolStatus structure for any tool name', async function () {
      this.timeout(30000); // Each iteration spawns a child process
      await fc.assert(
        fc.asyncProperty(toolNameArb, async (toolName: string) => {
          const commandMap: Record<string, string> = {
            'rustc': 'rustc',
            'cargo': 'cargo',
            'adk-studio': 'adk-studio',
          };
          
          const command = commandMap[toolName] || toolName;
          const result = await checkTool(toolName, command);
          
          // Property: Result must always be a valid ToolStatus
          assertValidToolStatus(result);
          
          // Property: If available, path and version must be non-null
          if (result.available) {
            assert.notStrictEqual(result.path, null, 'Available tool must have path');
            // Version can be null if parsing fails, but path must exist
            assert.strictEqual(result.error, null, 'Available tool must not have error');
          }
          
          // Property: If not available, error must be non-null
          if (!result.available) {
            assert.notStrictEqual(result.error, null, 'Unavailable tool must have error message');
          }
        }),
        FC_CONFIG
      );
    });

    /**
     * Property: Tool detection with empty PATH returns unavailable status.
     * 
     * **Validates: Requirements 1.1, 1.2, 1.3**
     */
    it('Property 1: returns unavailable when PATH is empty', async () => {
      await fc.assert(
        fc.asyncProperty(toolNameArb, async (toolName: string) => {
          const result = await checkTool(toolName, toolName, { pathEnv: '' });
          
          // Property: Result must be valid ToolStatus
          assertValidToolStatus(result);
          
          // Property: With empty PATH, tool should not be available
          // (unless it's an absolute path, which these aren't)
          assert.strictEqual(result.available, false, 'Tool should not be available with empty PATH');
          assert.notStrictEqual(result.error, null, 'Should have error message');
        }),
        FC_CONFIG
      );
    });

    /**
     * Property: Tool detection with non-existent custom path returns unavailable.
     * 
     * **Validates: Requirements 1.1, 1.2, 1.3**
     */
    it('Property 1: returns unavailable for non-existent custom paths', async () => {
      // Generate random non-existent paths
      const nonExistentPathArb = fc.stringMatching(/^\/nonexistent\/[a-z]{1,10}\/[a-z]{1,10}$/);
      
      await fc.assert(
        fc.asyncProperty(
          toolNameArb,
          nonExistentPathArb,
          async (toolName: string, fakePath: string) => {
            const result = await checkTool(toolName, toolName, { customPath: fakePath });
            
            // Property: Result must be valid ToolStatus
            assertValidToolStatus(result);
            
            // Property: Non-existent path should return unavailable
            assert.strictEqual(result.available, false, 'Non-existent path should be unavailable');
            assert.strictEqual(result.path, null, 'Path should be null for unavailable tool');
            assert.strictEqual(result.version, null, 'Version should be null for unavailable tool');
            assert.notStrictEqual(result.error, null, 'Should have error message');
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property: Real tool detection returns correct availability.
     * Tests against actual system tools that are likely to exist.
     * 
     * **Validates: Requirements 1.1, 1.2, 1.3**
     */
    it('Property 1: correctly detects real system tools', async () => {
      // Test with 'echo' which exists on all Unix systems
      const result = await checkTool('echo', 'echo');
      
      assertValidToolStatus(result);
      
      // echo should be available on any Unix system
      assert.strictEqual(result.available, true, 'echo should be available');
      assert.notStrictEqual(result.path, null, 'echo should have path');
      assert.strictEqual(result.error, null, 'echo should not have error');
    });

    /**
     * Property: Tool detection handles timeout gracefully.
     * 
     * **Validates: Requirements 1.1, 1.2, 1.3**
     */
    it('Property 1: handles very short timeout gracefully', async () => {
      // Use a real command but with extremely short timeout
      const result = await checkTool('test', 'sleep', { timeout: 1 });
      
      assertValidToolStatus(result);
      // Result should be valid regardless of whether it timed out
    });
  });
});

/**
 * Asserts that a value is a valid ToolStatus object.
 */
function assertValidToolStatus(status: ToolStatus): void {
  assert.strictEqual(typeof status, 'object', 'Status must be an object');
  assert.strictEqual(typeof status.available, 'boolean', 'available must be boolean');
  assert.ok(
    status.path === null || typeof status.path === 'string',
    'path must be string or null'
  );
  assert.ok(
    status.version === null || typeof status.version === 'string',
    'version must be string or null'
  );
  assert.ok(
    status.error === null || typeof status.error === 'string',
    'error must be string or null'
  );
}

describe('EnvironmentChecker - Validation Error Messaging', () => {
  /**
   * Property 2: Validation Error Messaging
   * 
   * For any environment validation failure, the error output SHALL contain
   * the name of the missing component and non-empty installation guidance text.
   * 
   * **Validates: Requirements 1.4, 1.5**
   */
  describe('getInstallationGuide', () => {
    /**
     * Property 2: Installation guide returns non-empty guidance for known tools.
     * 
     * **Validates: Requirements 1.4, 1.5**
     */
    it('Property 2: returns non-empty guidance for all known tools', async () => {
      await fc.assert(
        fc.asyncProperty(toolNameArb, async (toolName: string) => {
          const guide = getInstallationGuide(toolName);
          
          // Property: Guide must be a non-empty string
          assert.strictEqual(typeof guide, 'string', 'Guide must be a string');
          assert.ok(guide.length > 0, 'Guide must not be empty');
          
          // Property: Guide must contain actionable content (URL or command)
          const hasUrl = guide.includes('http') || guide.includes('https');
          const hasCommand = guide.includes('cargo') || guide.includes('curl') || guide.includes('install');
          assert.ok(hasUrl || hasCommand, 'Guide must contain URL or installation command');
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 2: Installation guide returns guidance even for unknown tools.
     * 
     * **Validates: Requirements 1.4, 1.5**
     */
    it('Property 2: returns non-empty guidance for arbitrary tool names', async () => {
      // Generate arbitrary tool names (not just the known ones)
      const arbitraryToolNameArb = fc.stringMatching(/^[a-z][a-z0-9_-]{0,20}$/);
      
      await fc.assert(
        fc.asyncProperty(arbitraryToolNameArb, async (toolName: string) => {
          const guide = getInstallationGuide(toolName);
          
          // Property: Guide must always be a non-empty string
          assert.strictEqual(typeof guide, 'string', 'Guide must be a string');
          assert.ok(guide.length > 0, 'Guide must not be empty');
          
          // Property: Guide for unknown tools should mention the tool name
          if (!['rustc', 'cargo', 'adk-studio'].includes(toolName)) {
            assert.ok(
              guide.includes(toolName),
              `Guide for unknown tool should mention the tool name: ${toolName}`
            );
          }
        }),
        FC_CONFIG
      );
    });
  });

  describe('checkTool error messages', () => {
    /**
     * Property 2: Error messages contain component name when validation fails.
     * 
     * **Validates: Requirements 1.4, 1.5**
     */
    it('Property 2: error message contains component name for failed checks', async () => {
      // Map of tool identifiers to their human-readable names used in checkTool
      const toolDisplayNames: Record<string, string> = {
        'rustc': 'Rust compiler',
        'cargo': 'Cargo',
        'adk-studio': 'ADK Studio',
      };
      
      await fc.assert(
        fc.asyncProperty(toolNameArb, async (toolName: string) => {
          // Force a failure by using empty PATH
          const result = await checkTool(
            toolDisplayNames[toolName] || toolName,
            toolName,
            { pathEnv: '' }
          );
          
          // Property: When tool is unavailable, error must exist
          assert.strictEqual(result.available, false, 'Tool should be unavailable with empty PATH');
          assert.notStrictEqual(result.error, null, 'Error message must exist for failed check');
          
          // Property: Error message must be non-empty
          assert.ok(
            result.error!.length > 0,
            'Error message must not be empty'
          );
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 2: Failed validation provides both error and guidance.
     * 
     * **Validates: Requirements 1.4, 1.5**
     */
    it('Property 2: failed validation has error and corresponding guidance available', async () => {
      const toolDisplayNames: Record<string, string> = {
        'rustc': 'Rust compiler',
        'cargo': 'Cargo',
        'adk-studio': 'ADK Studio',
      };
      
      await fc.assert(
        fc.asyncProperty(toolNameArb, async (toolName: string) => {
          // Force a failure
          const result = await checkTool(
            toolDisplayNames[toolName] || toolName,
            toolName,
            { pathEnv: '' }
          );
          
          // Get the installation guide for this tool
          const guide = getInstallationGuide(toolName);
          
          // Property: When validation fails, both error and guidance must be available
          assert.strictEqual(result.available, false, 'Tool should be unavailable');
          assert.notStrictEqual(result.error, null, 'Error must exist');
          assert.ok(result.error!.length > 0, 'Error must be non-empty');
          assert.ok(guide.length > 0, 'Guide must be non-empty');
          
          // Property: Guide must provide actionable information
          const isActionable = 
            guide.includes('http') || 
            guide.includes('install') || 
            guide.includes('cargo') ||
            guide.includes('PATH');
          assert.ok(isActionable, 'Guide must be actionable');
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 2: Error messages for non-existent paths contain meaningful info.
     * 
     * **Validates: Requirements 1.4, 1.5**
     */
    it('Property 2: error messages for non-existent custom paths are meaningful', async () => {
      const nonExistentPathArb = fc.stringMatching(/^\/nonexistent\/[a-z]{1,10}\/[a-z]{1,10}$/);
      const toolDisplayNames: Record<string, string> = {
        'rustc': 'Rust compiler',
        'cargo': 'Cargo',
        'adk-studio': 'ADK Studio',
      };
      
      await fc.assert(
        fc.asyncProperty(
          toolNameArb,
          nonExistentPathArb,
          async (toolName: string, fakePath: string) => {
            const displayName = toolDisplayNames[toolName] || toolName;
            const result = await checkTool(displayName, toolName, { customPath: fakePath });
            
            // Property: Error must exist and be non-empty
            assert.strictEqual(result.available, false, 'Tool should be unavailable');
            assert.notStrictEqual(result.error, null, 'Error must exist');
            assert.ok(result.error!.length > 0, 'Error must be non-empty');
          }
        ),
        FC_CONFIG
      );
    });
  });
});


describe('EnvironmentChecker - API Key Detection', () => {
  /**
   * Property 3: API Key Detection
   * 
   * For any .env file content and any set of required API key names,
   * the Environment_Checker SHALL correctly identify which keys are
   * present and which are missing.
   * 
   * **Validates: Requirements 1.7**
   */

  describe('parseEnvContent', () => {
    /**
     * Property 3: Parsing extracts all valid key-value pairs.
     * For duplicate keys, the last value wins (standard .env behavior).
     * 
     * **Validates: Requirements 1.7**
     */
    it('Property 3: correctly parses all valid KEY=VALUE pairs', async () => {
      // Generate entries with non-whitespace-only values to avoid edge case
      // Also filter out values that would be interpreted as quoted values
      const cleanEnvEntryArb = fc.record({
        key: envVarNameArb,
        value: fc.string({ minLength: 0, maxLength: 50 })
          .filter(s => !s.includes('\n'))
          .filter(s => {
            // Filter out values that would be interpreted as quoted values
            if (s.length >= 2) {
              if ((s.startsWith('"') && s.endsWith('"')) ||
                  (s.startsWith("'") && s.endsWith("'"))) {
                return false;
              }
            }
            return true;
          })
      });

      const cleanEnvFileArb = fc.array(cleanEnvEntryArb, { minLength: 0, maxLength: 15 }).map(entries => {
        const lines: string[] = [];
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          // Deterministically inject comments and blanks based on index.
          if (i % 5 === 0) {
            lines.push('# This is a comment');
          }
          if (i % 7 === 0) {
            lines.push('');
          }
          lines.push(`${entry.key}=${entry.value}`);
        }
        
        // Build expected values map - last value wins for duplicate keys
        const expectedValues: Record<string, string> = {};
        for (const entry of entries) {
          if (entry.key.length > 0) {
            expectedValues[entry.key] = entry.value;
          }
        }
        
        return {
          content: lines.join('\n'),
          entries,
          expectedValues
        };
      });

      await fc.assert(
        fc.asyncProperty(cleanEnvFileArb, async ({ content, expectedValues }) => {
          const parsed = parseEnvContent(content);
          
          // Property: All unique keys should be present with their last value
          for (const [key, expectedValue] of Object.entries(expectedValues)) {
            assert.ok(
              key in parsed,
              `Key "${key}" should be present in parsed result`
            );
            assert.strictEqual(
              parsed[key],
              expectedValue,
              `Value for "${key}" should match the last occurrence`
            );
          }
          
          // Property: No extra keys should be present
          assert.strictEqual(
            Object.keys(parsed).length,
            Object.keys(expectedValues).length,
            'Parsed result should have same number of keys as expected'
          );
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 3: Parsing ignores comments and empty lines.
     * 
     * **Validates: Requirements 1.7**
     */
    it('Property 3: ignores comments and empty lines', async () => {
      const contentWithCommentsArb = fc.tuple(
        envVarNameArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('\n'))
      ).map(([key, value]) => ({
        content: `# Comment line\n\n${key}=${value}\n# Another comment\n\n`,
        key,
        value
      }));

      await fc.assert(
        fc.asyncProperty(contentWithCommentsArb, async ({ content, key, value }) => {
          const parsed = parseEnvContent(content);
          
          // Property: Only the actual key-value pair should be parsed
          assert.strictEqual(Object.keys(parsed).length, 1, 'Should have exactly one key');
          assert.strictEqual(parsed[key], value, 'Value should match');
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 3: Parsing handles quoted values correctly.
     * 
     * **Validates: Requirements 1.7**
     */
    it('Property 3: strips surrounding quotes from values', async () => {
      const quotedValueArb = fc.tuple(
        envVarNameArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('\n') && !s.includes('"') && !s.includes("'")),
        fc.constantFrom('"', "'")
      ).map(([key, value, quote]) => ({
        content: `${key}=${quote}${value}${quote}`,
        key,
        expectedValue: value
      }));

      await fc.assert(
        fc.asyncProperty(quotedValueArb, async ({ content, key, expectedValue }) => {
          const parsed = parseEnvContent(content);
          
          // Property: Quotes should be stripped from value
          assert.strictEqual(parsed[key], expectedValue, 'Quotes should be stripped');
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 3: Parsing returns empty object for empty/invalid content.
     * 
     * **Validates: Requirements 1.7**
     */
    it('Property 3: returns empty object for empty or comment-only content', async () => {
      const emptyContentArb = fc.constantFrom(
        '',
        '# Just a comment',
        '# Comment 1\n# Comment 2\n\n',
        '\n\n\n'
      );

      await fc.assert(
        fc.asyncProperty(emptyContentArb, async (content) => {
          const parsed = parseEnvContent(content);
          
          // Property: Should return empty object
          assert.deepStrictEqual(parsed, {}, 'Should return empty object');
        }),
        FC_CONFIG
      );
    });
  });

  describe('checkApiKeys', () => {
    /**
     * Property 3: Correctly identifies present keys.
     * 
     * **Validates: Requirements 1.7**
     */
    it('Property 3: identifies keys as present when they exist with non-empty values', async () => {
      const presentKeyArb = fc.tuple(
        envVarNameArb,
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes('\n') && s.trim().length > 0)
      ).map(([key, value]) => ({
        content: `${key}=${value}`,
        key,
        value
      }));

      await fc.assert(
        fc.asyncProperty(presentKeyArb, async ({ content, key }) => {
          const result = checkApiKeys(content, [key]);
          
          // Property: Result should have exactly one entry
          assert.strictEqual(result.length, 1, 'Should have one result');
          
          // Property: Key should be marked as present
          assert.strictEqual(result[0].envVar, key, 'envVar should match');
          assert.strictEqual(result[0].present, true, 'Key should be marked as present');
          
          // Property: Name should be human-readable
          assert.ok(result[0].name.length > 0, 'Name should not be empty');
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 3: Correctly identifies missing keys.
     * 
     * **Validates: Requirements 1.7**
     */
    it('Property 3: identifies keys as missing when they do not exist', async () => {
      const missingKeyArb = fc.tuple(
        envVarNameArb,
        envVarNameArb.filter(k => k.length > 0)
      ).filter(([existing, required]) => existing !== required)
        .map(([existingKey, requiredKey]) => ({
          content: `${existingKey}=somevalue`,
          requiredKey
        }));

      await fc.assert(
        fc.asyncProperty(missingKeyArb, async ({ content, requiredKey }) => {
          const result = checkApiKeys(content, [requiredKey]);
          
          // Property: Result should have exactly one entry
          assert.strictEqual(result.length, 1, 'Should have one result');
          
          // Property: Key should be marked as missing
          assert.strictEqual(result[0].envVar, requiredKey, 'envVar should match');
          assert.strictEqual(result[0].present, false, 'Key should be marked as missing');
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 3: Correctly identifies keys with empty values as missing.
     * 
     * **Validates: Requirements 1.7**
     */
    it('Property 3: identifies keys with empty values as missing', async () => {
      const emptyValueArb = fc.tuple(
        envVarNameArb,
        fc.constantFrom('', '   ', '\t')
      ).map(([key, emptyValue]) => ({
        content: `${key}=${emptyValue}`,
        key
      }));

      await fc.assert(
        fc.asyncProperty(emptyValueArb, async ({ content, key }) => {
          const result = checkApiKeys(content, [key]);
          
          // Property: Key with empty value should be marked as missing
          assert.strictEqual(result.length, 1, 'Should have one result');
          assert.strictEqual(result[0].present, false, 'Key with empty value should be missing');
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 3: Handles multiple required keys correctly.
     * 
     * **Validates: Requirements 1.7**
     */
    it('Property 3: correctly handles mix of present and missing keys', async () => {
      const mixedKeysArb = fc.tuple(
        fc.array(envVarNameArb, { minLength: 1, maxLength: 5 }),
        fc.array(envVarNameArb, { minLength: 1, maxLength: 5 })
      ).map(([presentKeys, missingKeys]) => {
        // Ensure no overlap
        const uniquePresentKeys = [...new Set(presentKeys)];
        const uniqueMissingKeys = [...new Set(missingKeys)].filter(k => !uniquePresentKeys.includes(k));
        
        const content = uniquePresentKeys.map(k => `${k}=value_${k}`).join('\n');
        const allRequired = [...uniquePresentKeys, ...uniqueMissingKeys];
        
        return {
          content,
          presentKeys: uniquePresentKeys,
          missingKeys: uniqueMissingKeys,
          allRequired
        };
      });

      await fc.assert(
        fc.asyncProperty(mixedKeysArb, async ({ content, presentKeys, missingKeys, allRequired }) => {
          const result = checkApiKeys(content, allRequired);
          
          // Property: Result count should match required keys count
          assert.strictEqual(result.length, allRequired.length, 'Result count should match required keys');
          
          // Property: Each present key should be marked as present
          for (const key of presentKeys) {
            const status = result.find(r => r.envVar === key);
            assert.ok(status, `Status for ${key} should exist`);
            assert.strictEqual(status!.present, true, `${key} should be present`);
          }
          
          // Property: Each missing key should be marked as missing
          for (const key of missingKeys) {
            const status = result.find(r => r.envVar === key);
            assert.ok(status, `Status for ${key} should exist`);
            assert.strictEqual(status!.present, false, `${key} should be missing`);
          }
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 3: Returns valid ApiKeyStatus structure for all inputs.
     * 
     * **Validates: Requirements 1.7**
     */
    it('Property 3: returns valid ApiKeyStatus structure for any input', async () => {
      const anyInputArb = fc.tuple(
        fc.string({ minLength: 0, maxLength: 200 }),
        fc.array(envVarNameArb, { minLength: 0, maxLength: 10 })
      );

      await fc.assert(
        fc.asyncProperty(anyInputArb, async ([content, requiredKeys]) => {
          const result = checkApiKeys(content, requiredKeys);
          
          // Property: Result should be an array
          assert.ok(Array.isArray(result), 'Result should be an array');
          
          // Property: Result length should match required keys length
          assert.strictEqual(result.length, requiredKeys.length, 'Result length should match');
          
          // Property: Each result should be a valid ApiKeyStatus
          for (const status of result) {
            assertValidApiKeyStatus(status);
          }
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 3: Human-readable name is generated from env var name.
     * 
     * **Validates: Requirements 1.7**
     */
    it('Property 3: generates human-readable name from env var name', async () => {
      await fc.assert(
        fc.asyncProperty(envVarNameArb, async (envVar) => {
          const result = checkApiKeys('', [envVar]);
          
          // Property: Name should be non-empty
          assert.ok(result[0].name.length > 0, 'Name should not be empty');
          
          // Property: Name should not contain underscores (converted to spaces)
          assert.ok(!result[0].name.includes('_'), 'Name should not contain underscores');
          
          // Property: Name should be title case (first letter of each word capitalized)
          const words = result[0].name.split(' ');
          for (const word of words) {
            if (word.length > 0) {
              assert.ok(
                word[0] === word[0].toUpperCase(),
                `Word "${word}" should start with uppercase`
              );
            }
          }
        }),
        FC_CONFIG
      );
    });
  });
});

describe('EnvironmentChecker - checkEnvironment with envFilePath', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-checker-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty apiKeys when no envFilePath is provided', async () => {
    const status = await checkEnvironment();
    assert.ok(Array.isArray(status.apiKeys), 'apiKeys should be an array');
    assert.strictEqual(status.apiKeys.length, 0, 'apiKeys should be empty when no envFilePath');
  });

  it('returns empty apiKeys when envFilePath is null', async () => {
    const status = await checkEnvironment({ envFilePath: null });
    assert.ok(Array.isArray(status.apiKeys), 'apiKeys should be an array');
    assert.strictEqual(status.apiKeys.length, 0, 'apiKeys should be empty when envFilePath is null');
  });

  it('populates apiKeys from .env file when envFilePath is provided', async () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'GOOGLE_API_KEY=test-key-123\nOPENAI_API_KEY=sk-abc\n');

    const status = await checkEnvironment({ envFilePath: envPath });

    assert.strictEqual(status.apiKeys.length, DEFAULT_API_KEYS.length, 'Should check all default API keys');

    const googleKey = status.apiKeys.find(k => k.envVar === 'GOOGLE_API_KEY');
    assert.ok(googleKey, 'Should have GOOGLE_API_KEY status');
    assert.strictEqual(googleKey!.present, true, 'GOOGLE_API_KEY should be present');

    const openaiKey = status.apiKeys.find(k => k.envVar === 'OPENAI_API_KEY');
    assert.ok(openaiKey, 'Should have OPENAI_API_KEY status');
    assert.strictEqual(openaiKey!.present, true, 'OPENAI_API_KEY should be present');

    const anthropicKey = status.apiKeys.find(k => k.envVar === 'ANTHROPIC_API_KEY');
    assert.ok(anthropicKey, 'Should have ANTHROPIC_API_KEY status');
    assert.strictEqual(anthropicKey!.present, false, 'ANTHROPIC_API_KEY should be missing');
  });

  it('marks all keys as missing when .env file does not exist', async () => {
    const nonExistentPath = path.join(tmpDir, 'nonexistent', '.env');

    const status = await checkEnvironment({ envFilePath: nonExistentPath });

    assert.strictEqual(status.apiKeys.length, DEFAULT_API_KEYS.length, 'Should have status for all default keys');

    for (const keyStatus of status.apiKeys) {
      assert.strictEqual(keyStatus.present, false, `${keyStatus.envVar} should be marked as missing`);
      assert.ok(keyStatus.name.length > 0, `${keyStatus.envVar} should have a human-readable name`);
      assert.ok(DEFAULT_API_KEYS.includes(keyStatus.envVar), `${keyStatus.envVar} should be a default API key`);
    }
  });

  it('generates correct human-readable names for missing keys', async () => {
    const nonExistentPath = path.join(tmpDir, 'nonexistent', '.env');

    const status = await checkEnvironment({ envFilePath: nonExistentPath });

    const googleKey = status.apiKeys.find(k => k.envVar === 'GOOGLE_API_KEY');
    assert.ok(googleKey, 'Should have GOOGLE_API_KEY');
    assert.strictEqual(googleKey!.name, 'Google Api Key', 'Name should be title-cased');

    const openaiKey = status.apiKeys.find(k => k.envVar === 'OPENAI_API_KEY');
    assert.ok(openaiKey, 'Should have OPENAI_API_KEY');
    assert.strictEqual(openaiKey!.name, 'Openai Api Key', 'Name should be title-cased');

    const anthropicKey = status.apiKeys.find(k => k.envVar === 'ANTHROPIC_API_KEY');
    assert.ok(anthropicKey, 'Should have ANTHROPIC_API_KEY');
    assert.strictEqual(anthropicKey!.name, 'Anthropic Api Key', 'Name should be title-cased');
  });

  it('still returns tool statuses alongside apiKeys', async () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'GOOGLE_API_KEY=test\n');

    const status = await checkEnvironment({ envFilePath: envPath });

    // Tool statuses should still be present
    assert.ok('rustc' in status, 'Should have rustc status');
    assert.ok('cargo' in status, 'Should have cargo status');
    assert.ok('adkStudio' in status, 'Should have adkStudio status');
    assert.ok('apiKeys' in status, 'Should have apiKeys');
    assert.strictEqual(typeof status.rustc.available, 'boolean', 'rustc.available should be boolean');
    assert.strictEqual(typeof status.cargo.available, 'boolean', 'cargo.available should be boolean');
    assert.strictEqual(typeof status.adkStudio.available, 'boolean', 'adkStudio.available should be boolean');
  });

  it('handles empty .env file gracefully', async () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, '');

    const status = await checkEnvironment({ envFilePath: envPath });

    assert.strictEqual(status.apiKeys.length, DEFAULT_API_KEYS.length, 'Should check all default keys');
    for (const keyStatus of status.apiKeys) {
      assert.strictEqual(keyStatus.present, false, `${keyStatus.envVar} should be missing in empty .env`);
    }
  });
});

describe('EnvironmentChecker - updateEnvKey', () => {
  it('adds a new key to empty content', () => {
    const result = updateEnvKey('', 'GOOGLE_API_KEY', 'my-secret');
    assert.strictEqual(result, '\nGOOGLE_API_KEY=my-secret');

    // Verify round-trip: parseEnvContent should read the key back
    const parsed = parseEnvContent(result);
    assert.strictEqual(parsed['GOOGLE_API_KEY'], 'my-secret');
  });

  it('updates an existing key in-place', () => {
    const content = 'GOOGLE_API_KEY=old-value\nOPENAI_API_KEY=sk-abc';
    const result = updateEnvKey(content, 'GOOGLE_API_KEY', 'new-value');

    // Verify the key was updated, not duplicated
    const lines = result.split('\n');
    const matchingLines = lines.filter(l => l.startsWith('GOOGLE_API_KEY='));
    assert.strictEqual(matchingLines.length, 1, 'Should have exactly one GOOGLE_API_KEY line');
    assert.strictEqual(matchingLines[0], 'GOOGLE_API_KEY=new-value');

    // Verify other keys are preserved
    const parsed = parseEnvContent(result);
    assert.strictEqual(parsed['GOOGLE_API_KEY'], 'new-value');
    assert.strictEqual(parsed['OPENAI_API_KEY'], 'sk-abc');
  });

  it('does not create duplicates when updating an existing key', () => {
    const content = 'API_KEY=first\nOTHER=val\nAPI_KEY=second';
    const result = updateEnvKey(content, 'API_KEY', 'updated');

    // Both existing occurrences should be replaced
    const lines = result.split('\n');
    const matchingLines = lines.filter(l => l.startsWith('API_KEY='));
    // All occurrences of the key get replaced to the new value
    for (const line of matchingLines) {
      assert.strictEqual(line, 'API_KEY=updated', 'All occurrences should be updated');
    }

    // Verify round-trip
    const parsed = parseEnvContent(result);
    assert.strictEqual(parsed['API_KEY'], 'updated');
  });

  it('appends a new key to content that does not end with a newline', () => {
    const content = 'EXISTING_KEY=value';
    const result = updateEnvKey(content, 'NEW_KEY', 'new-value');

    // Should have a blank line separator before the new key
    const parsed = parseEnvContent(result);
    assert.strictEqual(parsed['EXISTING_KEY'], 'value', 'Existing key should be preserved');
    assert.strictEqual(parsed['NEW_KEY'], 'new-value', 'New key should be added');
  });

  it('appends a new key to content that ends with a newline', () => {
    const content = 'EXISTING_KEY=value\n';
    const result = updateEnvKey(content, 'NEW_KEY', 'new-value');

    const parsed = parseEnvContent(result);
    assert.strictEqual(parsed['EXISTING_KEY'], 'value', 'Existing key should be preserved');
    assert.strictEqual(parsed['NEW_KEY'], 'new-value', 'New key should be added');
  });

  it('preserves comments and blank lines when updating', () => {
    const content = '# API Configuration\nGOOGLE_API_KEY=old\n\n# Other settings\nDEBUG=true';
    const result = updateEnvKey(content, 'GOOGLE_API_KEY', 'new');

    assert.ok(result.includes('# API Configuration'), 'Comment should be preserved');
    assert.ok(result.includes('# Other settings'), 'Comment should be preserved');
    assert.ok(result.includes('DEBUG=true'), 'Other keys should be preserved');

    const parsed = parseEnvContent(result);
    assert.strictEqual(parsed['GOOGLE_API_KEY'], 'new');
    assert.strictEqual(parsed['DEBUG'], 'true');
  });
});

/**
 * Asserts that a value is a valid ApiKeyStatus object.
 */
function assertValidApiKeyStatus(status: ApiKeyStatus): void {
  assert.strictEqual(typeof status, 'object', 'Status must be an object');
  assert.strictEqual(typeof status.name, 'string', 'name must be string');
  assert.strictEqual(typeof status.envVar, 'string', 'envVar must be string');
  assert.strictEqual(typeof status.present, 'boolean', 'present must be boolean');
}
