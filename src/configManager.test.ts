/**
 * Unit tests for Configuration Manager.
 * 
 * Feature: adk-rust-extension
 * Tests: Default values, setting retrieval, change notifications
 * 
 * **Validates: Requirements 5.1-5.8**
 */

import * as assert from 'assert';
import { fireConfigChange, resetMocks, setMockConfigValue } from './test/setup';
import { ConfigurationManager, ExtensionSettings } from './configManager';

describe('ConfigurationManager', () => {
  let manager: ConfigurationManager;

  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    if (manager) {
      manager.dispose();
    }
  });

  describe('Default Values', () => {
    /**
     * Test: Default studioPort value is 3000.
     * **Validates: Requirement 5.1**
     */
    it('returns default studioPort of 3000', () => {
      manager = new ConfigurationManager();
      
      const settings = manager.getSettings();
      assert.strictEqual(settings.studioPort, 3000, 'Default studioPort should be 3000');
    });

    /**
     * Test: Default defaultTemplate value is 'simple-chat'.
     * **Validates: Requirement 5.2**
     */
    it('returns default template of simple-chat', () => {
      manager = new ConfigurationManager();
      
      const settings = manager.getSettings();
      assert.strictEqual(settings.defaultTemplate, 'simple-chat', 'Default template should be simple-chat');
    });

    /**
     * Test: Default adkStudioPath is null (use PATH).
     * **Validates: Requirement 5.3**
     */
    it('returns null for default adkStudioPath', () => {
      manager = new ConfigurationManager();
      
      const settings = manager.getSettings();
      assert.strictEqual(settings.adkStudioPath, null, 'Default adkStudioPath should be null');
    });

    /**
     * Test: Default cargoPath is null (use PATH).
     * **Validates: Requirement 5.4**
     */
    it('returns null for default cargoPath', () => {
      manager = new ConfigurationManager();
      
      const settings = manager.getSettings();
      assert.strictEqual(settings.cargoPath, null, 'Default cargoPath should be null');
    });

    /**
     * Test: Default rustcPath is null (use PATH).
     * **Validates: Requirement 5.5**
     */
    it('returns null for default rustcPath', () => {
      manager = new ConfigurationManager();
      
      const settings = manager.getSettings();
      assert.strictEqual(settings.rustcPath, null, 'Default rustcPath should be null');
    });

    /**
     * Test: Default autoStartStudio is true (Studio-first UX).
     * **Validates: Requirement 10.1**
     */
    it('returns true for default autoStartStudio', () => {
      manager = new ConfigurationManager();
      
      const settings = manager.getSettings();
      assert.strictEqual(settings.autoStartStudio, true, 'Default autoStartStudio should be true');
    });

    /**
     * Test: Default verbosity is 'normal'.
     * **Validates: Requirement 5.8**
     */
    it('returns normal for default verbosity', () => {
      manager = new ConfigurationManager();
      
      const settings = manager.getSettings();
      assert.strictEqual(settings.verbosity, 'normal', 'Default verbosity should be normal');
    });

    /**
     * Test: All default settings are returned together.
     * **Validates: Requirements 5.1-5.8**
     */
    it('returns complete settings object with all defaults', () => {
      manager = new ConfigurationManager();
      
      const settings = manager.getSettings();
      
      // Verify all properties exist
      assert.ok('studioPort' in settings, 'studioPort should exist');
      assert.ok('defaultTemplate' in settings, 'defaultTemplate should exist');
      assert.ok('adkStudioPath' in settings, 'adkStudioPath should exist');
      assert.ok('cargoPath' in settings, 'cargoPath should exist');
      assert.ok('rustcPath' in settings, 'rustcPath should exist');
      assert.ok('autoStartStudio' in settings, 'autoStartStudio should exist');
      assert.ok('verbosity' in settings, 'verbosity should exist');
      
      // Verify types
      assert.strictEqual(typeof settings.studioPort, 'number');
      assert.strictEqual(typeof settings.defaultTemplate, 'string');
      assert.strictEqual(typeof settings.autoStartStudio, 'boolean');
      assert.strictEqual(typeof settings.verbosity, 'string');
    });
  });

  describe('Setting Retrieval', () => {
    /**
     * Test: getSetting retrieves individual settings correctly.
     * **Validates: Requirements 5.1-5.8**
     */
    it('getSetting retrieves studioPort correctly', () => {
      setMockConfigValue('studioPort', 8080);
      manager = new ConfigurationManager();
      
      const port = manager.getSetting('studioPort');
      assert.strictEqual(port, 8080, 'Should retrieve configured studioPort');
    });

    /**
     * Test: getSetting retrieves template setting correctly.
     * **Validates: Requirement 5.2**
     */
    it('getSetting retrieves defaultTemplate correctly', () => {
      setMockConfigValue('defaultTemplate', 'graph-workflow');
      manager = new ConfigurationManager();
      
      const template = manager.getSetting('defaultTemplate');
      assert.strictEqual(template, 'graph-workflow', 'Should retrieve configured template');
    });

    /**
     * Test: getSetting retrieves custom paths correctly.
     * **Validates: Requirements 5.3, 5.4, 5.5**
     */
    it('getSetting retrieves custom paths correctly', () => {
      setMockConfigValue('adkStudioPath', '/custom/adk-studio');
      setMockConfigValue('cargoPath', '/custom/cargo');
      setMockConfigValue('rustcPath', '/custom/rustc');
      manager = new ConfigurationManager();
      
      assert.strictEqual(manager.getSetting('adkStudioPath'), '/custom/adk-studio');
      assert.strictEqual(manager.getSetting('cargoPath'), '/custom/cargo');
      assert.strictEqual(manager.getSetting('rustcPath'), '/custom/rustc');
    });

    /**
     * Test: getSetting retrieves boolean settings correctly.
     * **Validates: Requirement 5.7**
     */
    it('getSetting retrieves autoStartStudio correctly', () => {
      setMockConfigValue('autoStartStudio', true);
      manager = new ConfigurationManager();
      
      const autoStart = manager.getSetting('autoStartStudio');
      assert.strictEqual(autoStart, true, 'Should retrieve configured autoStartStudio');
    });

    /**
     * Test: getSetting retrieves verbosity correctly.
     * **Validates: Requirement 5.8**
     */
    it('getSetting retrieves verbosity correctly', () => {
      setMockConfigValue('verbosity', 'verbose');
      manager = new ConfigurationManager();
      
      const verbosity = manager.getSetting('verbosity');
      assert.strictEqual(verbosity, 'verbose', 'Should retrieve configured verbosity');
    });

    /**
     * Test: getSettings returns a copy, not the cached object.
     * **Validates: Requirements 5.1-5.8**
     */
    it('getSettings returns a copy of settings', () => {
      manager = new ConfigurationManager();
      
      const settings1 = manager.getSettings();
      const settings2 = manager.getSettings();
      
      // Should be equal but not the same object
      assert.deepStrictEqual(settings1, settings2, 'Settings should be equal');
      assert.notStrictEqual(settings1, settings2, 'Settings should be different objects');
      
      // Modifying one should not affect the other
      settings1.studioPort = 9999;
      assert.notStrictEqual(settings1.studioPort, settings2.studioPort, 'Modifying copy should not affect other copies');
    });

    /**
     * Test: Settings are cached for performance.
     * **Validates: Requirements 5.1-5.8**
     */
    it('caches settings for subsequent calls', () => {
      setMockConfigValue('studioPort', 3000);
      manager = new ConfigurationManager();
      
      // First call
      const settings1 = manager.getSettings();
      assert.strictEqual(settings1.studioPort, 3000);
      
      // Change the underlying config without firing change event
      setMockConfigValue('studioPort', 9999);
      
      // Second call should return cached value
      const settings2 = manager.getSettings();
      assert.strictEqual(settings2.studioPort, 3000, 'Should return cached value');
    });
  });

  describe('Change Notifications', () => {
    /**
     * Test: onSettingsChanged callback is invoked when settings change.
     * **Validates: Requirement 5.6**
     */
    it('invokes callback when settings change', () => {
      manager = new ConfigurationManager();
      
      let callbackInvoked = false;
      let receivedSettings: ExtensionSettings | null = null;
      
      manager.onSettingsChanged((settings) => {
        callbackInvoked = true;
        receivedSettings = settings;
      });
      
      // Trigger a config change
      fireConfigChange('adkRust');
      
      assert.strictEqual(callbackInvoked, true, 'Callback should be invoked');
      assert.notStrictEqual(receivedSettings, null, 'Settings should be passed to callback');
    });

    /**
     * Test: Multiple callbacks can be registered.
     * **Validates: Requirement 5.6**
     */
    it('supports multiple change listeners', () => {
      manager = new ConfigurationManager();
      
      let callback1Count = 0;
      let callback2Count = 0;
      
      manager.onSettingsChanged(() => { callback1Count++; });
      manager.onSettingsChanged(() => { callback2Count++; });
      
      fireConfigChange('adkRust');
      
      assert.strictEqual(callback1Count, 1, 'First callback should be invoked once');
      assert.strictEqual(callback2Count, 1, 'Second callback should be invoked once');
    });

    /**
     * Test: Disposing callback removes it from listeners.
     * **Validates: Requirement 5.6**
     */
    it('removes callback when disposed', () => {
      manager = new ConfigurationManager();
      
      let callbackCount = 0;
      
      const disposable = manager.onSettingsChanged(() => { callbackCount++; });
      
      // First change
      fireConfigChange('adkRust');
      assert.strictEqual(callbackCount, 1, 'Callback should be invoked');
      
      // Dispose the callback
      disposable.dispose();
      
      // Second change
      fireConfigChange('adkRust');
      assert.strictEqual(callbackCount, 1, 'Callback should not be invoked after dispose');
    });

    /**
     * Test: Only adkRust config changes trigger callbacks.
     * **Validates: Requirement 5.6**
     */
    it('only triggers for adkRust configuration changes', () => {
      manager = new ConfigurationManager();
      
      let callbackCount = 0;
      
      manager.onSettingsChanged(() => { callbackCount++; });
      
      // Change unrelated config
      fireConfigChange('someOtherExtension');
      assert.strictEqual(callbackCount, 0, 'Should not trigger for unrelated config');
      
      // Change adkRust config
      fireConfigChange('adkRust');
      assert.strictEqual(callbackCount, 1, 'Should trigger for adkRust config');
    });

    /**
     * Test: Cache is invalidated when settings change.
     * **Validates: Requirement 5.6**
     */
    it('invalidates cache when settings change', () => {
      setMockConfigValue('studioPort', 3000);
      manager = new ConfigurationManager();
      
      // First call - caches the value
      const settings1 = manager.getSettings();
      assert.strictEqual(settings1.studioPort, 3000);
      
      // Change the config and fire event
      setMockConfigValue('studioPort', 8080);
      fireConfigChange('adkRust');
      
      // Second call should get new value
      const settings2 = manager.getSettings();
      assert.strictEqual(settings2.studioPort, 8080, 'Should return new value after change');
    });

    /**
     * Test: Callback errors don't break other callbacks.
     * **Validates: Requirement 5.6**
     */
    it('continues notifying other callbacks if one throws', () => {
      manager = new ConfigurationManager();
      
      let callback2Invoked = false;
      
      manager.onSettingsChanged(() => {
        throw new Error('Callback error');
      });
      
      manager.onSettingsChanged(() => {
        callback2Invoked = true;
      });
      
      // Should not throw
      fireConfigChange('adkRust');
      
      assert.strictEqual(callback2Invoked, true, 'Second callback should still be invoked');
    });

    /**
     * Test: Callback receives complete settings object.
     * **Validates: Requirement 5.6**
     */
    it('passes complete settings object to callback', () => {
      setMockConfigValue('studioPort', 8080);
      setMockConfigValue('defaultTemplate', 'graph-workflow');
      setMockConfigValue('verbosity', 'verbose');
      manager = new ConfigurationManager();
      
      let receivedSettings: ExtensionSettings | null = null;
      
      manager.onSettingsChanged((settings) => {
        receivedSettings = settings;
      });
      
      fireConfigChange('adkRust');
      
      assert.notStrictEqual(receivedSettings, null);
      assert.strictEqual(receivedSettings!.studioPort, 8080);
      assert.strictEqual(receivedSettings!.defaultTemplate, 'graph-workflow');
      assert.strictEqual(receivedSettings!.verbosity, 'verbose');
    });
  });

  describe('Update Settings', () => {
    /**
     * Test: updateSetting updates the configuration.
     * **Validates: Requirements 5.1-5.8**
     */
    it('updateSetting updates configuration value', async () => {
      manager = new ConfigurationManager();
      
      await manager.updateSetting('studioPort', 9000);
      
      // After update, getting the setting should return the new value
      // (the mock fires a change event which invalidates cache)
      const port = manager.getSetting('studioPort');
      assert.strictEqual(port, 9000, 'Setting should be updated');
    });

    /**
     * Test: updateSetting triggers change notification.
     * **Validates: Requirement 5.6**
     */
    it('updateSetting triggers change notification', async () => {
      manager = new ConfigurationManager();
      
      let callbackInvoked = false;
      manager.onSettingsChanged(() => {
        callbackInvoked = true;
      });
      
      await manager.updateSetting('studioPort', 9000);
      
      assert.strictEqual(callbackInvoked, true, 'Change callback should be invoked');
    });
  });

  describe('Dispose', () => {
    /**
     * Test: Dispose cleans up all resources.
     * **Validates: Requirements 5.1-5.8**
     */
    it('cleans up resources on dispose', () => {
      manager = new ConfigurationManager();
      
      let callbackCount = 0;
      manager.onSettingsChanged(() => { callbackCount++; });
      
      // Dispose the manager
      manager.dispose();
      
      // Changes should not trigger callbacks
      fireConfigChange('adkRust');
      assert.strictEqual(callbackCount, 0, 'Callbacks should not be invoked after dispose');
    });
  });
});
