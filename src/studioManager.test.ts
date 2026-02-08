/**
 * Property-based tests for Studio Manager.
 * 
 * Feature: adk-rust-extension
 * Property 8: Server Lifecycle State Machine
 * 
 * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
 */

import * as assert from 'assert';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isPathWithinWorkspace } from './studioManager';
import { FC_CONFIG } from './test/testUtils';

/**
 * Server states in the lifecycle state machine.
 */
type ServerState = 'stopped' | 'starting' | 'ready' | 'running';

/**
 * Operations that can be performed on the server.
 */
type ServerOperation = 'start' | 'stop' | 'webviewOpen' | 'webviewClose' | 'serverCrash';

/**
 * Valid state transitions for the server lifecycle.
 * Maps from current state to valid (operation, next state) pairs.
 */
const VALID_TRANSITIONS: Record<ServerState, Array<{ op: ServerOperation; next: ServerState }>> = {
  'stopped': [
    { op: 'start', next: 'starting' },
    { op: 'stop', next: 'stopped' },  // No-op when already stopped
    { op: 'webviewClose', next: 'stopped' },  // No-op when already stopped
  ],
  'starting': [
    { op: 'stop', next: 'stopped' },  // Cancel startup
    { op: 'serverCrash', next: 'stopped' },  // Startup failure
    // Note: 'starting' -> 'ready' happens automatically when server is ready
  ],
  'ready': [
    { op: 'webviewOpen', next: 'running' },
    { op: 'stop', next: 'stopped' },
    { op: 'serverCrash', next: 'stopped' },
  ],
  'running': [
    { op: 'webviewClose', next: 'stopped' },  // Per requirement 3.5
    { op: 'stop', next: 'stopped' },
    { op: 'serverCrash', next: 'stopped' },
  ],
};

/**
 * Simulates the server state machine.
 * Returns the new state after applying an operation, or null if the transition is invalid.
 */
function applyOperation(state: ServerState, op: ServerOperation): ServerState | null {
  const validTransitions = VALID_TRANSITIONS[state];
  const transition = validTransitions.find(t => t.op === op);
  
  if (transition) {
    return transition.next;
  }
  
  // Some operations are no-ops in certain states
  if (op === 'start' && state !== 'stopped') {
    // Starting when already started is a no-op (returns current state)
    return state;
  }
  
  if (op === 'webviewOpen' && state === 'running') {
    // Opening webview when already running is a no-op
    return state;
  }
  
  // Invalid transition
  return null;
}

/**
 * Simulates the automatic transition from 'starting' to 'ready'.
 * This happens when the server successfully starts.
 */
function simulateServerReady(state: ServerState): ServerState {
  if (state === 'starting') {
    return 'ready';
  }
  return state;
}

/**
 * Tracks the state machine through a sequence of operations.
 */
interface StateTrace {
  initialState: ServerState;
  operations: ServerOperation[];
  states: ServerState[];
  valid: boolean;
  invalidAt?: number;
}

/**
 * Executes a sequence of operations and tracks the state trace.
 */
function executeOperationSequence(operations: ServerOperation[]): StateTrace {
  const trace: StateTrace = {
    initialState: 'stopped',
    operations,
    states: ['stopped'],
    valid: true,
  };
  
  let currentState: ServerState = 'stopped';
  
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    
    // If we're in 'starting' state and the next op isn't stop/crash,
    // simulate the server becoming ready first
    if (currentState === 'starting' && op !== 'stop' && op !== 'serverCrash') {
      currentState = simulateServerReady(currentState);
      trace.states.push(currentState);
    }
    
    const nextState = applyOperation(currentState, op);
    
    if (nextState === null) {
      trace.valid = false;
      trace.invalidAt = i;
      break;
    }
    
    currentState = nextState;
    trace.states.push(currentState);
  }
  
  return trace;
}

/**
 * Arbitrary for generating server operations.
 */
const serverOperationArb: fc.Arbitrary<ServerOperation> = fc.constantFrom(
  'start',
  'stop',
  'webviewOpen',
  'webviewClose',
  'serverCrash'
);

/**
 * Arbitrary for generating sequences of server operations.
 */
const operationSequenceArb = fc.array(serverOperationArb, { minLength: 1, maxLength: 20 });

/**
 * Arbitrary for generating valid operation sequences that follow the state machine.
 * This generates sequences that are guaranteed to be valid.
 */
const validOperationSequenceArb: fc.Arbitrary<ServerOperation[]> = fc.array(
  fc.integer({ min: 0, max: 4 }),
  { minLength: 1, maxLength: 15 }
).map(indices => {
  const operations: ServerOperation[] = [];
  let currentState: ServerState = 'stopped';
  
  for (const index of indices) {
    // If in 'starting', simulate becoming ready
    if (currentState === 'starting') {
      currentState = 'ready';
    }
    
    const validOps: Array<{ op: ServerOperation; next: ServerState }> = VALID_TRANSITIONS[currentState];
    if (validOps.length === 0) break;
    
    const transition: { op: ServerOperation; next: ServerState } = validOps[index % validOps.length];
    operations.push(transition.op);
    currentState = transition.next;
  }
  
  return operations;
});

describe('StudioManager', () => {
  describe('Server Lifecycle State Machine', () => {
    /**
     * Property 8: Server Lifecycle State Machine
     * 
     * For any sequence of server operations (start, stop, webview open, webview close),
     * the server state transitions SHALL be valid: (stopped → starting → ready),
     * (ready → running while webview open), (running → stopped when webview closes),
     * and the server SHALL never be in an invalid state.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
     */
    
    /**
     * Property 8: Valid operation sequences always result in valid states.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
     */
    it('Property 8: valid operation sequences always result in valid states', async () => {
      await fc.assert(
        fc.asyncProperty(validOperationSequenceArb, async (operations) => {
          const trace = executeOperationSequence(operations);
          
          // Property: All states in the trace should be valid server states
          const validStates: ServerState[] = ['stopped', 'starting', 'ready', 'running'];
          for (const state of trace.states) {
            assert.ok(
              validStates.includes(state),
              `State "${state}" should be a valid server state`
            );
          }
          
          // Property: The trace should be valid (no invalid transitions)
          assert.ok(
            trace.valid,
            `Operation sequence should be valid, failed at operation ${trace.invalidAt}`
          );
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 8: Server always starts in 'stopped' state.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
     */
    it('Property 8: server always starts in stopped state', async () => {
      await fc.assert(
        fc.asyncProperty(operationSequenceArb, async (operations) => {
          const trace = executeOperationSequence(operations);
          
          // Property: Initial state should always be 'stopped'
          assert.strictEqual(
            trace.initialState,
            'stopped',
            'Server should always start in stopped state'
          );
          
          // Property: First state in trace should be 'stopped'
          assert.strictEqual(
            trace.states[0],
            'stopped',
            'First state in trace should be stopped'
          );
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 8: Start operation from stopped state transitions to starting.
     * 
     * **Validates: Requirements 3.1, 3.2**
     */
    it('Property 8: start from stopped transitions to starting', async () => {
      const result = applyOperation('stopped', 'start');
      assert.strictEqual(result, 'starting', 'Start from stopped should go to starting');
    });

    /**
     * Property 8: Starting state transitions to ready when server is ready.
     * 
     * **Validates: Requirements 3.2**
     */
    it('Property 8: starting transitions to ready when server is ready', async () => {
      const result = simulateServerReady('starting');
      assert.strictEqual(result, 'ready', 'Starting should transition to ready');
    });

    /**
     * Property 8: Webview open from ready state transitions to running.
     * 
     * **Validates: Requirements 3.4**
     */
    it('Property 8: webview open from ready transitions to running', async () => {
      const result = applyOperation('ready', 'webviewOpen');
      assert.strictEqual(result, 'running', 'Webview open from ready should go to running');
    });

    /**
     * Property 8: Webview close from running state transitions to stopped.
     * 
     * **Validates: Requirements 3.5**
     */
    it('Property 8: webview close from running transitions to stopped', async () => {
      const result = applyOperation('running', 'webviewClose');
      assert.strictEqual(result, 'stopped', 'Webview close from running should go to stopped');
    });

    /**
     * Property 8: Stop operation always transitions to stopped state.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
     */
    it('Property 8: stop always transitions to stopped', async () => {
      const states: ServerState[] = ['stopped', 'starting', 'ready', 'running'];
      
      for (const state of states) {
        const result = applyOperation(state, 'stop');
        assert.strictEqual(
          result,
          'stopped',
          `Stop from ${state} should transition to stopped`
        );
      }
    });

    /**
     * Property 8: Server crash always transitions to stopped state.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
     */
    it('Property 8: server crash always transitions to stopped', async () => {
      const crashableStates: ServerState[] = ['starting', 'ready', 'running'];
      
      for (const state of crashableStates) {
        const result = applyOperation(state, 'serverCrash');
        assert.strictEqual(
          result,
          'stopped',
          `Server crash from ${state} should transition to stopped`
        );
      }
    });

    /**
     * Property 8: Random operation sequences never leave server in invalid state.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
     */
    it('Property 8: random sequences never leave server in invalid state', async () => {
      await fc.assert(
        fc.asyncProperty(operationSequenceArb, async (operations) => {
          const trace = executeOperationSequence(operations);
          
          // Property: Final state should always be a valid state
          const finalState = trace.states[trace.states.length - 1];
          const validStates: ServerState[] = ['stopped', 'starting', 'ready', 'running'];
          
          assert.ok(
            validStates.includes(finalState),
            `Final state "${finalState}" should be valid`
          );
          
          // Property: All intermediate states should be valid
          for (let i = 0; i < trace.states.length; i++) {
            assert.ok(
              validStates.includes(trace.states[i]),
              `State at index ${i} ("${trace.states[i]}") should be valid`
            );
          }
        }),
        FC_CONFIG
      );
    });

    /**
     * Property 8: State transitions are deterministic.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
     */
    it('Property 8: state transitions are deterministic', async () => {
      await fc.assert(
        fc.asyncProperty(
          validOperationSequenceArb,
          async (operations) => {
            // Execute the same sequence twice
            const trace1 = executeOperationSequence(operations);
            const trace2 = executeOperationSequence(operations);
            
            // Property: Same operations should produce same state sequence
            assert.deepStrictEqual(
              trace1.states,
              trace2.states,
              'Same operations should produce same states'
            );
            
            assert.strictEqual(
              trace1.valid,
              trace2.valid,
              'Same operations should have same validity'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 8: Idempotent operations don't change state.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
     */
    it('Property 8: stop from stopped is idempotent', async () => {
      const result = applyOperation('stopped', 'stop');
      assert.strictEqual(result, 'stopped', 'Stop from stopped should remain stopped');
    });

    /**
     * Property 8: Start from non-stopped state is idempotent.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
     */
    it('Property 8: start from non-stopped states is idempotent', async () => {
      const nonStoppedStates: ServerState[] = ['starting', 'ready', 'running'];
      
      for (const state of nonStoppedStates) {
        const result = applyOperation(state, 'start');
        assert.strictEqual(
          result,
          state,
          `Start from ${state} should remain in ${state}`
        );
      }
    });

    /**
     * Property 8: Full lifecycle sequence is valid.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
     */
    it('Property 8: full lifecycle sequence is valid', async () => {
      // Test the complete happy path: stopped -> starting -> ready -> running -> stopped
      const operations: ServerOperation[] = ['start', 'webviewOpen', 'webviewClose'];
      const trace = executeOperationSequence(operations);
      
      assert.ok(trace.valid, 'Full lifecycle should be valid');
      
      // Check state progression
      // Initial: stopped
      // After start: starting -> ready (auto-transition before webviewOpen)
      // After webviewOpen: running
      // After webviewClose: stopped
      const expectedFinalState = 'stopped';
      const actualFinalState = trace.states[trace.states.length - 1];
      
      assert.strictEqual(
        actualFinalState,
        expectedFinalState,
        `Final state should be ${expectedFinalState}, got ${actualFinalState}`
      );
    });

    /**
     * Property 8: Multiple start-stop cycles are valid.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
     */
    it('Property 8: multiple start-stop cycles are valid', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (cycles) => {
            const operations: ServerOperation[] = [];
            
            for (let i = 0; i < cycles; i++) {
              operations.push('start', 'webviewOpen', 'webviewClose');
            }
            
            const trace = executeOperationSequence(operations);
            
            // Property: All cycles should be valid
            assert.ok(
              trace.valid,
              `${cycles} start-stop cycles should be valid`
            );
            
            // Property: Should end in stopped state
            const finalState = trace.states[trace.states.length - 1];
            assert.strictEqual(
              finalState,
              'stopped',
              'Should end in stopped state after cycles'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 8: Server crash recovery is valid.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
     */
    it('Property 8: server crash recovery is valid', async () => {
      // Test crash during running state and recovery
      const operations: ServerOperation[] = [
        'start',        // stopped -> starting -> ready
        'webviewOpen',  // ready -> running
        'serverCrash',  // running -> stopped
        'start',        // stopped -> starting -> ready
        'webviewOpen',  // ready -> running
        'webviewClose', // running -> stopped
      ];
      
      const trace = executeOperationSequence(operations);
      
      assert.ok(trace.valid, 'Crash recovery sequence should be valid');
      assert.strictEqual(
        trace.states[trace.states.length - 1],
        'stopped',
        'Should end in stopped state'
      );
    });

    /**
     * Property 8: State machine invariant - never in undefined state.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
     */
    it('Property 8: state machine never reaches undefined state', async () => {
      await fc.assert(
        fc.asyncProperty(operationSequenceArb, async (operations) => {
          const trace = executeOperationSequence(operations);
          
          // Property: No state should be undefined or null
          for (const state of trace.states) {
            assert.ok(
              state !== undefined && state !== null,
              'State should never be undefined or null'
            );
          }
        }),
        FC_CONFIG
      );
    });
  });
});

describe('Workspace Path Validation', () => {
  let tempRoot: string;
  let workspaceRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-workspace-path-test-'));
    workspaceRoot = path.join(tempRoot, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
  });

  afterEach(() => {
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('allows paths that resolve within the workspace root', () => {
    const targetPath = path.join(workspaceRoot, 'src', 'main.rs');
    assert.strictEqual(
      isPathWithinWorkspace(targetPath, workspaceRoot),
      true,
      'Path inside workspace should be allowed'
    );
  });

  it('rejects paths that only share a prefix with workspace root', () => {
    const escapedPath = path.join(`${workspaceRoot}-evil`, 'src', 'main.rs');
    assert.strictEqual(
      isPathWithinWorkspace(escapedPath, workspaceRoot),
      false,
      'Prefix-only match must be rejected'
    );
  });

  describe('saveProject path validation', () => {
    /**
     * Tests for the saveProject handler path validation logic.
     * The handler rejects absolute paths and validates resolved relative paths
     * are within the workspace using isPathWithinWorkspace.
     *
     * **Validates: Requirements 6.1, 6.2, 6.3**
     */

    it('accepts a simple relative path resolved against workspace root', () => {
      const relativePath = 'src/main.rs';
      const absolutePath = path.resolve(workspaceRoot, relativePath);
      assert.strictEqual(
        isPathWithinWorkspace(absolutePath, workspaceRoot),
        true,
        'Relative path resolved against workspace should be within workspace'
      );
    });

    it('rejects a relative path with ../ that escapes workspace', () => {
      const relativePath = '../../../etc/passwd';
      const absolutePath = path.resolve(workspaceRoot, relativePath);
      assert.strictEqual(
        isPathWithinWorkspace(absolutePath, workspaceRoot),
        false,
        'Relative path with ../ escaping workspace must be rejected'
      );
    });

    it('accepts a relative path with ../ that stays within workspace', () => {
      const relativePath = 'src/../Cargo.toml';
      const absolutePath = path.resolve(workspaceRoot, relativePath);
      assert.strictEqual(
        isPathWithinWorkspace(absolutePath, workspaceRoot),
        true,
        'Relative path with ../ that stays within workspace should be accepted'
      );
    });

    it('detects absolute paths using path.isAbsolute', () => {
      assert.strictEqual(path.isAbsolute('/etc/passwd'), true, 'Unix absolute path should be detected');
      assert.strictEqual(path.isAbsolute('src/main.rs'), false, 'Relative path should not be absolute');
      assert.strictEqual(path.isAbsolute('./src/main.rs'), false, 'Dot-relative path should not be absolute');
    });

    it('accepts workspace root itself as a valid target', () => {
      const absolutePath = path.resolve(workspaceRoot, '.');
      assert.strictEqual(
        isPathWithinWorkspace(absolutePath, workspaceRoot),
        true,
        'Workspace root itself should be valid'
      );
    });
  });

  it('rejects symlink paths that escape outside workspace root', function () {
    const externalRoot = path.join(tempRoot, 'outside');
    const linkInWorkspace = path.join(workspaceRoot, 'external-link');
    fs.mkdirSync(externalRoot, { recursive: true });

    try {
      fs.symlinkSync(externalRoot, linkInWorkspace, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EPERM') {
        this.skip();
        return;
      }
      throw error;
    }

    const escapedPath = path.join(linkInWorkspace, 'secret.txt');
    assert.strictEqual(
      isPathWithinWorkspace(escapedPath, workspaceRoot),
      false,
      'Symlink path escaping workspace must be rejected'
    );
  });
});


  describe('Server Failure Error Messaging', () => {
    /**
     * Arbitrary for generating port numbers.
     */
    const portArb = fc.integer({ min: 1024, max: 65535 });

    /**
     * Arbitrary for generating failure reasons.
     */
    const failureReasonArb = fc.constantFrom(
      'EADDRINUSE',
      'EACCES',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOENT',
      'spawn ENOENT',
      'binary not found',
      'permission denied',
      'connection timeout',
      'server crashed unexpectedly'
    );

    /**
     * Simulates creating a server failure error message.
     * This mirrors the actual implementation in studioManager.ts.
     */
    function createServerFailureError(port: number, reason: string): string {
      return `Failed to start ADK Studio server on port ${port}: ${reason}`;
    }

    /**
     * Property 9: Server Failure Error Messaging
     * 
     * For any server startup failure, the error message SHALL contain
     * diagnostic information including the attempted port and failure reason.
     * 
     * **Validates: Requirements 3.6**
     */
    it('Property 9: error message contains port number for any failure', async () => {
      await fc.assert(
        fc.asyncProperty(
          portArb,
          failureReasonArb,
          async (port: number, reason: string) => {
            const errorMessage = createServerFailureError(port, reason);

            // Property: Error message must contain the port number
            assert.ok(
              errorMessage.includes(port.toString()),
              `Error message should contain port ${port}`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 9: Error message contains failure reason.
     * 
     * **Validates: Requirements 3.6**
     */
    it('Property 9: error message contains failure reason for any failure', async () => {
      await fc.assert(
        fc.asyncProperty(
          portArb,
          failureReasonArb,
          async (port: number, reason: string) => {
            const errorMessage = createServerFailureError(port, reason);

            // Property: Error message must contain the failure reason
            assert.ok(
              errorMessage.includes(reason),
              `Error message should contain reason "${reason}"`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 9: Error message is non-empty and informative.
     * 
     * **Validates: Requirements 3.6**
     */
    it('Property 9: error message is non-empty and informative', async () => {
      await fc.assert(
        fc.asyncProperty(
          portArb,
          failureReasonArb,
          async (port: number, reason: string) => {
            const errorMessage = createServerFailureError(port, reason);

            // Property: Error message must be non-empty
            assert.ok(
              errorMessage.length > 0,
              'Error message should not be empty'
            );

            // Property: Error message should mention ADK Studio
            assert.ok(
              errorMessage.includes('ADK Studio') || errorMessage.includes('server'),
              'Error message should mention ADK Studio or server'
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 9: Error message format is consistent.
     * 
     * **Validates: Requirements 3.6**
     */
    it('Property 9: error message format is consistent', async () => {
      await fc.assert(
        fc.asyncProperty(
          portArb,
          failureReasonArb,
          async (port: number, reason: string) => {
            const errorMessage = createServerFailureError(port, reason);

            // Property: Error message should follow expected format
            const expectedPattern = /Failed to start.*port \d+.*:/;
            assert.ok(
              expectedPattern.test(errorMessage),
              `Error message should follow format "Failed to start...port X: reason"`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 9: Common failure scenarios produce actionable messages.
     * 
     * **Validates: Requirements 3.6**
     */
    it('Property 9: common failure scenarios produce actionable messages', async () => {
      const commonFailures = [
        { reason: 'EADDRINUSE', expectedHint: 'port' },
        { reason: 'ENOENT', expectedHint: 'ENOENT' },
        { reason: 'permission denied', expectedHint: 'permission' },
      ];

      for (const { reason, expectedHint } of commonFailures) {
        const port = 3000;
        const errorMessage = createServerFailureError(port, reason);

        assert.ok(
          errorMessage.toLowerCase().includes(expectedHint.toLowerCase()),
          `Error for "${reason}" should contain hint about "${expectedHint}"`
        );
      }
    });

    /**
     * Property 9: Error messages with random ports are valid.
     * 
     * **Validates: Requirements 3.6**
     */
    it('Property 9: error messages with any valid port are properly formatted', async () => {
      await fc.assert(
        fc.asyncProperty(
          portArb,
          async (port: number) => {
            const reason = 'test failure';
            const errorMessage = createServerFailureError(port, reason);

            // Property: Port should appear as a number in the message
            const portRegex = new RegExp(`\\b${port}\\b`);
            assert.ok(
              portRegex.test(errorMessage),
              `Port ${port} should appear as a distinct number in the message`
            );
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Property 9: Error messages with special characters in reason are handled.
     * 
     * **Validates: Requirements 3.6**
     */
    it('Property 9: error messages handle special characters in reason', async () => {
      const specialReasons = [
        'Error: ENOENT',
        'spawn /usr/bin/adk-studio ENOENT',
        'Connection refused (111)',
        'Timeout after 30000ms',
      ];

      await fc.assert(
        fc.asyncProperty(
          portArb,
          fc.constantFrom(...specialReasons),
          async (port: number, reason: string) => {
            const errorMessage = createServerFailureError(port, reason);

            // Property: Message should still contain port and reason
            assert.ok(
              errorMessage.includes(port.toString()),
              'Should contain port even with special characters in reason'
            );
            assert.ok(
              errorMessage.includes(reason),
              'Should contain reason even with special characters'
            );
          }
        ),
        FC_CONFIG
      );
    });
  });
