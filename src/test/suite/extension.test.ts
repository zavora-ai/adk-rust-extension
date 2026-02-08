/**
 * Integration tests for the ADK Rust extension.
 * These tests run in the VS Code environment.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * Waits for the extension to activate.
 * Returns the extension API if available.
 */
async function activateExtension(): Promise<void> {
  const ext = vscode.extensions.getExtension('zavora-ai.adk-rust-extension');
  if (!ext) {
    throw new Error('Extension not found');
  }
  
  if (!ext.isActive) {
    await ext.activate();
  }
}

suite('Extension Test Suite', () => {
  suiteSetup(async () => {
    // Ensure extension is activated before running tests
    await activateExtension();
    // Give VS Code a moment to register all commands
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  test('Extension should be present', () => {
    const ext = vscode.extensions.getExtension('zavora-ai.adk-rust-extension');
    assert.ok(ext, 'Extension should be present');
  });

  test('Extension should be active', async () => {
    const ext = vscode.extensions.getExtension('zavora-ai.adk-rust-extension');
    assert.ok(ext, 'Extension should be present');
    assert.ok(ext.isActive, 'Extension should be active');
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    
    const expectedCommands = [
      'adkRust.openStudio',
      'adkRust.createProject',
      'adkRust.build',
      'adkRust.run',
      'adkRust.checkEnvironment',
      'adkRust.viewLogs',
      'adkRust.refreshProjects',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(
        commands.includes(cmd),
        `Command ${cmd} should be registered`
      );
    }
  });
});
