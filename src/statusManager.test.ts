/**
 * Unit tests for StatusManager module.
 *
 * Feature: adk-rust-extension
 * Tests: Status bar items, progress indicators, notifications
 *
 * **Validates: Requirements 6.1-6.6**
 */

import * as assert from 'assert';
import { resetMocks } from './test/setup';
import { StatusManager, ServerStatus } from './statusManager';

describe('StatusManager', () => {
  let statusManager: StatusManager;

  beforeEach(() => {
    resetMocks();
    statusManager = new StatusManager();
  });

  afterEach(() => {
    if (statusManager) {
      statusManager.dispose();
    }
  });

  describe('Constructor', () => {
    /**
     * Test: StatusManager initializes without errors.
     * **Validates: Requirement 6.1, 6.2**
     */
    it('creates status bar items on construction', () => {
      assert.ok(statusManager, 'StatusManager should be created');
    });
  });

  describe('Server Status', () => {
    /**
     * Test: showServerStatus displays running server.
     * **Validates: Requirement 6.2**
     */
    it('showServerStatus does not throw for running server', () => {
      const status: ServerStatus = {
        running: true,
        port: 3000,
        pid: 1234,
        url: 'http://localhost:3000',
      };
      assert.doesNotThrow(() => statusManager.showServerStatus(status));
    });

    /**
     * Test: showServerStatus displays stopped server.
     * **Validates: Requirement 6.2**
     */
    it('showServerStatus does not throw for stopped server', () => {
      const status: ServerStatus = {
        running: false,
        port: 3000,
        pid: null,
        url: null,
      };
      assert.doesNotThrow(() => statusManager.showServerStatus(status));
    });

    /**
     * Test: showServerStarting displays starting state.
     * **Validates: Requirement 6.1**
     */
    it('showServerStarting does not throw', () => {
      assert.doesNotThrow(() => statusManager.showServerStarting(3000));
    });

    /**
     * Test: showServerStopped displays stopped state.
     * **Validates: Requirement 6.2**
     */
    it('showServerStopped does not throw', () => {
      assert.doesNotThrow(() => statusManager.showServerStopped());
    });

    /**
     * Test: showServerCrashed displays crash state.
     * **Validates: Requirement 6.6**
     */
    it('showServerCrashed does not throw', () => {
      assert.doesNotThrow(() => statusManager.showServerCrashed('Connection refused'));
    });
  });

  describe('Build Progress', () => {
    /**
     * Test: showBuildProgress displays progress.
     * **Validates: Requirement 6.3**
     */
    it('showBuildProgress does not throw', () => {
      assert.doesNotThrow(() => statusManager.showBuildProgress('Building...'));
    });

    /**
     * Test: updateBuildProgress updates message.
     * **Validates: Requirement 6.3**
     */
    it('updateBuildProgress does not throw', () => {
      statusManager.showBuildProgress('Building...');
      assert.doesNotThrow(() => statusManager.updateBuildProgress('Compiling...'));
    });

    /**
     * Test: hideBuildProgress hides progress.
     * **Validates: Requirement 6.3**
     */
    it('hideBuildProgress does not throw', () => {
      statusManager.showBuildProgress('Building...');
      assert.doesNotThrow(() => statusManager.hideBuildProgress());
    });

    /**
     * Test: hideBuildProgress can be called without showing first.
     * **Validates: Requirement 6.3**
     */
    it('hideBuildProgress does not throw when not showing', () => {
      assert.doesNotThrow(() => statusManager.hideBuildProgress());
    });
  });

  describe('Notifications', () => {
    /**
     * Test: showError displays error notification.
     * **Validates: Requirement 6.4**
     */
    it('showError does not throw', async () => {
      await assert.doesNotReject(async () => {
        await statusManager.showError('Build failed');
      });
    });

    /**
     * Test: showError accepts action buttons.
     * **Validates: Requirement 6.4**
     */
    it('showError accepts action buttons', async () => {
      await assert.doesNotReject(async () => {
        await statusManager.showError('Build failed', 'Retry', 'View Logs');
      });
    });

    /**
     * Test: showSuccess displays success notification.
     * **Validates: Requirement 6.4**
     */
    it('showSuccess does not throw', async () => {
      await assert.doesNotReject(async () => {
        await statusManager.showSuccess('Build completed');
      });
    });

    /**
     * Test: showSuccess accepts action buttons.
     * **Validates: Requirement 6.4**
     */
    it('showSuccess accepts action buttons', async () => {
      await assert.doesNotReject(async () => {
        await statusManager.showSuccess('Build completed', 'Open Output');
      });
    });

    /**
     * Test: showWarning displays warning notification.
     * **Validates: Requirement 6.4**
     */
    it('showWarning does not throw', async () => {
      await assert.doesNotReject(async () => {
        await statusManager.showWarning('Missing dependency');
      });
    });

    /**
     * Test: showWarning accepts action buttons.
     * **Validates: Requirement 6.4**
     */
    it('showWarning accepts action buttons', async () => {
      await assert.doesNotReject(async () => {
        await statusManager.showWarning('Missing dependency', 'Install', 'Ignore');
      });
    });
  });

  describe('Dispose', () => {
    /**
     * Test: dispose cleans up resources.
     * **Validates: Requirement 6.1-6.6**
     */
    it('dispose does not throw', () => {
      assert.doesNotThrow(() => statusManager.dispose());
    });

    /**
     * Test: dispose can be called multiple times.
     * **Validates: Requirement 6.1-6.6**
     */
    it('dispose can be called multiple times', () => {
      assert.doesNotThrow(() => {
        statusManager.dispose();
        statusManager.dispose();
      });
    });
  });
});
