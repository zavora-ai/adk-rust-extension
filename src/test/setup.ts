/**
 * Test setup file that registers mocks before tests run.
 * This file should be loaded before any test files.
 */

import * as Module from 'module';

// Import the mock module
import * as vscodeMock from './mocks/vscodeMock';

// Store the original require function
const originalRequire = Module.prototype.require;

// Override require to intercept 'vscode' module requests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module.prototype as any).require = function(id: string) {
  if (id === 'vscode') {
    return vscodeMock;
  }
  return originalRequire.apply(this, [id]);
};

// Export mock utilities for tests to use
export { fireConfigChange, resetMocks, setMockConfigValue, getMockConfigValue } from './mocks/vscodeMock';
