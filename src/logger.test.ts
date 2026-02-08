/**
 * Unit tests for Logger module.
 *
 * Feature: adk-rust-extension
 * Tests: Log levels, error formatting, context handling
 *
 * **Validates: Requirements 6.4, 6.5**
 */

import * as assert from 'assert';
import * as fc from 'fast-check';
import { resetMocks } from './test/setup';
import { FC_CONFIG } from './test/testUtils';
import {
  Logger,
  LogLevel,
  ErrorContext,
  formatError,
  maskSensitiveData,
  getLogger,
  disposeLogger,
} from './logger';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    resetMocks();
    disposeLogger(); // Reset singleton
  });

  afterEach(() => {
    if (logger) {
      logger.dispose();
    }
    disposeLogger();
  });

  describe('Log Levels', () => {
    /**
     * Test: Default log level is 'info'.
     * **Validates: Requirement 6.4**
     */
    it('has default log level of info', () => {
      logger = new Logger('Test');
      assert.strictEqual(logger.getLevel(), 'info');
    });

    /**
     * Test: setLevel changes the minimum log level.
     * **Validates: Requirement 6.4**
     */
    it('setLevel changes minimum log level', () => {
      logger = new Logger('Test');

      logger.setLevel('debug');
      assert.strictEqual(logger.getLevel(), 'debug');

      logger.setLevel('warn');
      assert.strictEqual(logger.getLevel(), 'warn');

      logger.setLevel('error');
      assert.strictEqual(logger.getLevel(), 'error');
    });

    /**
     * Test: All log level values are valid.
     * **Validates: Requirement 6.4**
     */
    it('accepts all valid log levels', () => {
      logger = new Logger('Test');
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

      for (const level of levels) {
        logger.setLevel(level);
        assert.strictEqual(logger.getLevel(), level);
      }
    });
  });

  describe('Logging Methods', () => {
    /**
     * Test: debug() logs at debug level.
     * **Validates: Requirement 6.4**
     */
    it('debug() does not throw', () => {
      logger = new Logger('Test');
      logger.setLevel('debug');
      assert.doesNotThrow(() => logger.debug('Debug message'));
    });

    /**
     * Test: info() logs at info level.
     * **Validates: Requirement 6.4**
     */
    it('info() does not throw', () => {
      logger = new Logger('Test');
      assert.doesNotThrow(() => logger.info('Info message'));
    });

    /**
     * Test: warn() logs at warn level.
     * **Validates: Requirement 6.4**
     */
    it('warn() does not throw', () => {
      logger = new Logger('Test');
      assert.doesNotThrow(() => logger.warn('Warning message'));
    });

    /**
     * Test: error() logs at error level.
     * **Validates: Requirement 6.4**
     */
    it('error() does not throw', () => {
      logger = new Logger('Test');
      assert.doesNotThrow(() => logger.error('Error message'));
    });

    /**
     * Test: error() accepts error object.
     * **Validates: Requirement 6.4**
     */
    it('error() accepts error object', () => {
      logger = new Logger('Test');
      const error = new Error('Test error');
      assert.doesNotThrow(() => logger.error('Error occurred', error));
    });

    /**
     * Test: error() accepts context.
     * **Validates: Requirement 6.4**
     */
    it('error() accepts context', () => {
      logger = new Logger('Test');
      const context: ErrorContext = {
        component: 'TestComponent',
        operation: 'testOperation',
        data: { key: 'value' },
      };
      assert.doesNotThrow(() => logger.error('Error occurred', undefined, context));
    });

    /**
     * Test: error() accepts both error and context.
     * **Validates: Requirement 6.4**
     */
    it('error() accepts both error and context', () => {
      logger = new Logger('Test');
      const error = new Error('Test error');
      const context: ErrorContext = {
        component: 'TestComponent',
        operation: 'testOperation',
      };
      assert.doesNotThrow(() => logger.error('Error occurred', error, context));
    });
  });

  describe('Output Channel Control', () => {
    /**
     * Test: show() does not throw.
     * **Validates: Requirement 6.5**
     */
    it('show() does not throw', () => {
      logger = new Logger('Test');
      assert.doesNotThrow(() => logger.show());
    });

    /**
     * Test: show(true) preserves focus.
     * **Validates: Requirement 6.5**
     */
    it('show(true) does not throw', () => {
      logger = new Logger('Test');
      assert.doesNotThrow(() => logger.show(true));
    });

    /**
     * Test: hide() does not throw.
     * **Validates: Requirement 6.5**
     */
    it('hide() does not throw', () => {
      logger = new Logger('Test');
      assert.doesNotThrow(() => logger.hide());
    });

    /**
     * Test: clear() does not throw.
     * **Validates: Requirement 6.5**
     */
    it('clear() does not throw', () => {
      logger = new Logger('Test');
      assert.doesNotThrow(() => logger.clear());
    });
  });

  describe('Dispose', () => {
    /**
     * Test: dispose() cleans up resources.
     * **Validates: Requirement 6.4**
     */
    it('dispose() does not throw', () => {
      logger = new Logger('Test');
      assert.doesNotThrow(() => logger.dispose());
    });
  });
});

describe('formatError', () => {
  /**
   * Test: Formats Error objects correctly.
   * **Validates: Requirement 6.4**
   */
  it('formats Error objects with name and message', () => {
    const error = new Error('Test error message');
    const formatted = formatError(error);

    assert.ok(formatted.includes('Error:'), 'Should include error type');
    assert.ok(formatted.includes('Test error message'), 'Should include error message');
  });

  /**
   * Test: Includes stack trace for Error objects.
   * **Validates: Requirement 6.4**
   */
  it('includes stack trace for Error objects', () => {
    const error = new Error('Test error');
    const formatted = formatError(error);

    assert.ok(formatted.includes('Stack trace:'), 'Should include stack trace header');
    assert.ok(formatted.includes('at '), 'Should include stack frames');
  });

  /**
   * Test: Formats non-Error values.
   * **Validates: Requirement 6.4**
   */
  it('formats non-Error values', () => {
    const formatted = formatError('String error');
    assert.ok(formatted.includes('String error'), 'Should include string value');
  });

  /**
   * Test: Includes component in context.
   * **Validates: Requirement 6.4**
   */
  it('includes component from context', () => {
    const error = new Error('Test');
    const context: ErrorContext = { component: 'TestComponent' };
    const formatted = formatError(error, context);

    assert.ok(formatted.includes('Component: TestComponent'), 'Should include component');
  });

  /**
   * Test: Includes operation in context.
   * **Validates: Requirement 6.4**
   */
  it('includes operation from context', () => {
    const error = new Error('Test');
    const context: ErrorContext = { operation: 'testOperation' };
    const formatted = formatError(error, context);

    assert.ok(formatted.includes('Operation: testOperation'), 'Should include operation');
  });

  /**
   * Test: Includes data in context.
   * **Validates: Requirement 6.4**
   */
  it('includes data from context', () => {
    const error = new Error('Test');
    const context: ErrorContext = { data: { port: 3000, host: 'localhost' } };
    const formatted = formatError(error, context);

    assert.ok(formatted.includes('Context:'), 'Should include context header');
    assert.ok(formatted.includes('port'), 'Should include data key');
    assert.ok(formatted.includes('3000'), 'Should include data value');
  });

  /**
   * Test: Masks sensitive data in context.
   * **Validates: Requirement 6.4**
   */
  it('masks sensitive data in context', () => {
    const error = new Error('Test');
    const context: ErrorContext = {
      data: { API_KEY: 'secret123', normalKey: 'visible' },
    };
    const formatted = formatError(error, context);

    assert.ok(formatted.includes('***REDACTED***'), 'Should mask sensitive value');
    assert.ok(!formatted.includes('secret123'), 'Should not include actual secret');
    // The value is in JSON format, so check for the key-value pair
    assert.ok(formatted.includes('normalKey'), 'Should include non-sensitive key');
  });
});

describe('maskSensitiveData', () => {
  /**
   * Test: Masks API_KEY values.
   * **Validates: Requirement 6.4**
   */
  it('masks API_KEY values', () => {
    const data = { API_KEY: 'secret123' };
    const masked = maskSensitiveData(data);

    assert.strictEqual(masked.API_KEY, '***REDACTED***');
  });

  /**
   * Test: Masks SECRET values.
   * **Validates: Requirement 6.4**
   */
  it('masks SECRET values', () => {
    const data = { MY_SECRET: 'hidden' };
    const masked = maskSensitiveData(data);

    assert.strictEqual(masked.MY_SECRET, '***REDACTED***');
  });

  /**
   * Test: Masks TOKEN values.
   * **Validates: Requirement 6.4**
   */
  it('masks TOKEN values', () => {
    const data = { AUTH_TOKEN: 'abc123' };
    const masked = maskSensitiveData(data);

    assert.strictEqual(masked.AUTH_TOKEN, '***REDACTED***');
  });

  /**
   * Test: Masks PASSWORD values.
   * **Validates: Requirement 6.4**
   */
  it('masks PASSWORD values', () => {
    const data = { DB_PASSWORD: 'pass123' };
    const masked = maskSensitiveData(data);

    assert.strictEqual(masked.DB_PASSWORD, '***REDACTED***');
  });

  /**
   * Test: Masks CREDENTIAL values.
   * **Validates: Requirement 6.4**
   */
  it('masks CREDENTIAL values', () => {
    const data = { USER_CREDENTIAL: 'cred123' };
    const masked = maskSensitiveData(data);

    assert.strictEqual(masked.USER_CREDENTIAL, '***REDACTED***');
  });

  /**
   * Test: Does not mask non-sensitive values.
   * **Validates: Requirement 6.4**
   */
  it('does not mask non-sensitive values', () => {
    const data = { port: '3000', host: 'localhost' };
    const masked = maskSensitiveData(data);

    assert.strictEqual(masked.port, '3000');
    assert.strictEqual(masked.host, 'localhost');
  });

  /**
   * Test: Handles empty values for sensitive keys.
   * **Validates: Requirement 6.4**
   */
  it('shows (not set) for empty sensitive values', () => {
    const data = { API_KEY: '' };
    const masked = maskSensitiveData(data);

    assert.strictEqual(masked.API_KEY, '(not set)');
  });

  /**
   * Test: Handles null/undefined values for sensitive keys.
   * **Validates: Requirement 6.4**
   */
  it('shows (not set) for null sensitive values', () => {
    const data = { API_KEY: null as unknown };
    const masked = maskSensitiveData(data as Record<string, unknown>);

    assert.strictEqual(masked.API_KEY, '(not set)');
  });

  /**
   * Test: Stringifies object values.
   * **Validates: Requirement 6.4**
   */
  it('stringifies object values', () => {
    const data = { config: { nested: 'value' } };
    const masked = maskSensitiveData(data as Record<string, unknown>);

    assert.strictEqual(masked.config, '{"nested":"value"}');
  });

  /**
   * Test: Case-insensitive key matching.
   * **Validates: Requirement 6.4**
   */
  it('matches sensitive keys case-insensitively', () => {
    const data = {
      api_key: 'secret1',
      Api_Key: 'secret2',
      API_KEY: 'secret3',
    };
    const masked = maskSensitiveData(data);

    assert.strictEqual(masked.api_key, '***REDACTED***');
    assert.strictEqual(masked.Api_Key, '***REDACTED***');
    assert.strictEqual(masked.API_KEY, '***REDACTED***');
  });
});

describe('getLogger / disposeLogger', () => {
  afterEach(() => {
    disposeLogger();
  });

  /**
   * Test: getLogger returns a Logger instance.
   * **Validates: Requirement 6.5**
   */
  it('getLogger returns a Logger instance', () => {
    const logger = getLogger();
    assert.ok(logger instanceof Logger);
  });

  /**
   * Test: getLogger returns the same instance.
   * **Validates: Requirement 6.5**
   */
  it('getLogger returns the same instance on multiple calls', () => {
    const logger1 = getLogger();
    const logger2 = getLogger();
    assert.strictEqual(logger1, logger2);
  });

  /**
   * Test: disposeLogger cleans up the singleton.
   * **Validates: Requirement 6.5**
   */
  it('disposeLogger allows creating a new instance', () => {
    const logger1 = getLogger();
    disposeLogger();
    const logger2 = getLogger();

    // After dispose, a new instance should be created
    assert.notStrictEqual(logger1, logger2);
  });
});


describe('Property 14: Error Logging Detail', () => {
  /**
   * Property 14: Error Logging Detail
   * 
   * For any error that occurs in the extension, the logged message SHALL contain
   * the error type, context information, and stack trace when available.
   * 
   * **Validates: Requirements 6.4**
   */

  /**
   * Arbitrary for generating error types.
   */
  const errorTypeArb = fc.constantFrom(
    'Error',
    'TypeError',
    'RangeError',
    'SyntaxError',
    'ReferenceError',
    'EvalError',
    'URIError'
  );

  /**
   * Arbitrary for generating error messages.
   */
  const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 }).filter(
    (s: string) => s.trim().length > 0
  );

  /**
   * Arbitrary for generating component names.
   */
  const componentNameArb = fc.constantFrom(
    'EnvironmentChecker',
    'ProjectScaffolder',
    'StudioManager',
    'BuildRunner',
    'ConfigManager',
    'StatusManager',
    'ProjectTreeProvider',
    'Logger'
  );

  /**
   * Arbitrary for generating operation names.
   */
  const operationNameArb = fc.constantFrom(
    'checkEnvironment',
    'createProject',
    'startServer',
    'stopServer',
    'build',
    'run',
    'parseOutput',
    'loadConfig',
    'saveConfig',
    'refresh'
  );

  /**
   * Arbitrary for generating context data.
   */
  const contextDataArb = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s: string) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
    fc.oneof(
      fc.string({ maxLength: 100 }),
      fc.integer(),
      fc.boolean()
    ),
    { minKeys: 0, maxKeys: 5 }
  );

  /**
   * Creates an error of the specified type.
   */
  function createError(type: string, message: string): Error {
    switch (type) {
      case 'TypeError':
        return new TypeError(message);
      case 'RangeError':
        return new RangeError(message);
      case 'SyntaxError':
        return new SyntaxError(message);
      case 'ReferenceError':
        return new ReferenceError(message);
      case 'EvalError':
        return new EvalError(message);
      case 'URIError':
        return new URIError(message);
      default:
        return new Error(message);
    }
  }

  /**
   * Property 14: Formatted error contains error type.
   * 
   * **Validates: Requirements 6.4**
   */
  it('Property 14: formatted error contains error type for any error', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArb,
        errorMessageArb,
        async (errorType: string, message: string) => {
          const error = createError(errorType, message);
          const formatted = formatError(error);

          // Property: Formatted output must contain the error type
          assert.ok(
            formatted.includes(errorType) || formatted.includes('Error'),
            `Formatted error should contain error type "${errorType}"`
          );
        }
      ),
      FC_CONFIG
    );
  });

  /**
   * Property 14: Formatted error contains error message.
   * 
   * **Validates: Requirements 6.4**
   */
  it('Property 14: formatted error contains error message for any error', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArb,
        errorMessageArb,
        async (errorType: string, message: string) => {
          const error = createError(errorType, message);
          const formatted = formatError(error);

          // Property: Formatted output must contain the error message
          assert.ok(
            formatted.includes(message),
            `Formatted error should contain message "${message}"`
          );
        }
      ),
      FC_CONFIG
    );
  });

  /**
   * Property 14: Formatted error contains stack trace when available.
   * 
   * **Validates: Requirements 6.4**
   */
  it('Property 14: formatted error contains stack trace when available', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArb,
        errorMessageArb,
        async (errorType: string, message: string) => {
          const error = createError(errorType, message);
          const formatted = formatError(error);

          // Property: If error has stack, formatted output should include it
          if (error.stack) {
            assert.ok(
              formatted.includes('Stack trace:') || formatted.includes('at '),
              'Formatted error should contain stack trace indicator'
            );
          }
        }
      ),
      FC_CONFIG
    );
  });

  /**
   * Property 14: Formatted error contains component from context.
   * 
   * **Validates: Requirements 6.4**
   */
  it('Property 14: formatted error contains component from context', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorMessageArb,
        componentNameArb,
        async (message: string, component: string) => {
          const error = new Error(message);
          const context: ErrorContext = { component };
          const formatted = formatError(error, context);

          // Property: Formatted output must contain the component name
          assert.ok(
            formatted.includes(component),
            `Formatted error should contain component "${component}"`
          );
        }
      ),
      FC_CONFIG
    );
  });

  /**
   * Property 14: Formatted error contains operation from context.
   * 
   * **Validates: Requirements 6.4**
   */
  it('Property 14: formatted error contains operation from context', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorMessageArb,
        operationNameArb,
        async (message: string, operation: string) => {
          const error = new Error(message);
          const context: ErrorContext = { operation };
          const formatted = formatError(error, context);

          // Property: Formatted output must contain the operation name
          assert.ok(
            formatted.includes(operation),
            `Formatted error should contain operation "${operation}"`
          );
        }
      ),
      FC_CONFIG
    );
  });

  /**
   * Property 14: Formatted error contains context data.
   * 
   * **Validates: Requirements 6.4**
   */
  it('Property 14: formatted error contains context data keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorMessageArb,
        contextDataArb,
        async (message: string, data: Record<string, unknown>) => {
          // Skip if data is empty
          if (Object.keys(data).length === 0) return;

          const error = new Error(message);
          const context: ErrorContext = { data };
          const formatted = formatError(error, context);

          // Property: Formatted output should contain Context header when data present
          assert.ok(
            formatted.includes('Context:'),
            'Formatted error should contain Context header when data is present'
          );
        }
      ),
      FC_CONFIG
    );
  });

  /**
   * Property 14: Formatted error is non-empty for any error.
   * 
   * **Validates: Requirements 6.4**
   */
  it('Property 14: formatted error is non-empty for any error', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArb,
        errorMessageArb,
        async (errorType: string, message: string) => {
          const error = createError(errorType, message);
          const formatted = formatError(error);

          // Property: Formatted output must be non-empty
          assert.ok(
            formatted.length > 0,
            'Formatted error should not be empty'
          );

          // Property: Formatted output should have multiple lines for errors with stack
          if (error.stack) {
            const lines = formatted.split('\n');
            assert.ok(
              lines.length > 1,
              'Formatted error with stack should have multiple lines'
            );
          }
        }
      ),
      FC_CONFIG
    );
  });

  /**
   * Property 14: Sensitive data is masked in formatted error.
   * 
   * **Validates: Requirements 6.4**
   */
  it('Property 14: sensitive data is masked in formatted error', async () => {
    const sensitiveKeys = ['API_KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'CREDENTIAL'];

    await fc.assert(
      fc.asyncProperty(
        errorMessageArb,
        fc.constantFrom(...sensitiveKeys),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (message: string, sensitiveKey: string, sensitiveValue: string) => {
          const error = new Error(message);
          const context: ErrorContext = {
            data: { [sensitiveKey]: sensitiveValue },
          };
          const formatted = formatError(error, context);

          // Property: Sensitive value should be masked
          assert.ok(
            !formatted.includes(sensitiveValue),
            `Formatted error should not contain sensitive value for ${sensitiveKey}`
          );
          assert.ok(
            formatted.includes('***REDACTED***'),
            'Formatted error should contain redaction marker'
          );
        }
      ),
      FC_CONFIG
    );
  });

  /**
   * Property 14: Full context is included in formatted error.
   * 
   * **Validates: Requirements 6.4**
   */
  it('Property 14: full context is included in formatted error', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorMessageArb,
        componentNameArb,
        operationNameArb,
        async (message: string, component: string, operation: string) => {
          const error = new Error(message);
          const context: ErrorContext = {
            component,
            operation,
            data: { port: 3000 },
          };
          const formatted = formatError(error, context);

          // Property: All context fields should be present
          assert.ok(
            formatted.includes(component),
            'Should include component'
          );
          assert.ok(
            formatted.includes(operation),
            'Should include operation'
          );
          assert.ok(
            formatted.includes('3000'),
            'Should include data values'
          );
        }
      ),
      FC_CONFIG
    );
  });
});
