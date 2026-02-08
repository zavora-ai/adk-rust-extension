/**
 * Test utilities and helpers for ADK Rust extension tests.
 */

import * as fc from 'fast-check';

const DEFAULT_FC_SEED = 1337;
let tempPathCounter = 0;

function getFastCheckSeed(): number {
  const rawSeed = process.env.FC_SEED;
  if (!rawSeed) {
    return DEFAULT_FC_SEED;
  }

  const parsedSeed = Number.parseInt(rawSeed, 10);
  return Number.isFinite(parsedSeed) ? parsedSeed : DEFAULT_FC_SEED;
}

/**
 * Property test configuration following the design document.
 * Minimum 100 iterations per test.
 */
export const FC_CONFIG: fc.Parameters<unknown> = {
  numRuns: 100,
  verbose: false,
  seed: getFastCheckSeed(),
};

/**
 * Arbitrary for generating valid project names.
 * Project names must start with a letter and contain only alphanumeric, underscore, or hyphen.
 */
export const projectNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);

/**
 * Arbitrary for generating template types.
 */
export const templateTypeArb = fc.constantFrom(
  'simple-chat',
  'tool-using-agent',
  'multi-agent-workflow',
  'graph-workflow'
) as fc.Arbitrary<'simple-chat' | 'tool-using-agent' | 'multi-agent-workflow' | 'graph-workflow'>;

/**
 * Arbitrary for generating valid environment variable names.
 */
export const envVarNameArb = fc.stringMatching(/^[A-Z][A-Z0-9_]{0,63}$/);

/**
 * Arbitrary for generating .env file content.
 */
export const envFileContentArb = fc.array(
  fc.tuple(envVarNameArb, fc.string({ minLength: 0, maxLength: 100 })),
  { minLength: 0, maxLength: 20 }
).map(pairs => 
  pairs.map(([key, value]) => `${key}=${value}`).join('\n')
);

/**
 * Arbitrary for generating PATH-like strings.
 */
export const pathArb = fc.array(
  fc.stringMatching(/^\/[a-zA-Z0-9_/-]{1,50}$/),
  { minLength: 1, maxLength: 10 }
).map(paths => paths.join(':'));

/**
 * Arbitrary for generating tool names.
 */
export const toolNameArb = fc.constantFrom('rustc', 'cargo', 'adk-studio');

/**
 * Cargo error info type for property testing.
 */
export interface CargoErrorInfo {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
  code: string | undefined;
}

/**
 * Arbitrary for generating cargo error output.
 */
export const cargoErrorArb: fc.Arbitrary<CargoErrorInfo> = fc.record({
  file: fc.stringMatching(/^[a-zA-Z0-9_/-]+\.rs$/),
  line: fc.integer({ min: 1, max: 10000 }),
  column: fc.integer({ min: 1, max: 500 }),
  severity: fc.constantFrom('error' as const, 'warning' as const),
  message: fc.string({ minLength: 1, maxLength: 200 }),
  code: fc.option(fc.stringMatching(/^E[0-9]{4}$/), { nil: undefined })
});

/**
 * Creates a temporary directory path for testing.
 */
export function createTempPath(prefix: string): string {
  tempPathCounter += 1;
  return `/tmp/adk-test-${prefix}-${FC_CONFIG.seed}-${tempPathCounter}`;
}

/**
 * Asserts that a string contains valid TOML syntax (basic check).
 */
export function isValidTomlBasic(content: string): boolean {
  // Basic TOML validation - check for common patterns
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    
    // Check for section headers
    if (trimmed.startsWith('[')) {
      if (!trimmed.endsWith(']')) return false;
      continue;
    }
    
    // Check for key-value pairs
    if (!trimmed.includes('=')) return false;
  }
  return true;
}

/**
 * Asserts that a string contains valid Rust syntax structure (basic check).
 */
export function hasValidRustStructure(content: string): boolean {
  // Check for main function
  const hasMain = /fn\s+main\s*\(/.test(content);
  // Check for use statements or no imports needed
  const hasUseOrEmpty = /use\s+/.test(content) || content.length > 0;
  // Check for balanced braces (basic)
  const openBraces = (content.match(/{/g) || []).length;
  const closeBraces = (content.match(/}/g) || []).length;
  
  return hasMain && hasUseOrEmpty && openBraces === closeBraces;
}
