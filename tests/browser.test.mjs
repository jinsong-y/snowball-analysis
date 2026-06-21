import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, accessSync, constants } from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('browser module', () => {
  it('connectBrowser() should throw meaningful error when Chrome is not running', async () => {
    const { connectBrowser } = await import('../scripts/browser.mjs');
    await assert.rejects(
      () => connectBrowser(),
      (err) => {
        assert.ok(err instanceof Error, 'should throw an Error');
        assert.ok(
          err.message.includes('Chrome') || err.message.includes('9222') || err.message.includes('连接') || err.message.includes('connect'),
          `error message should be helpful, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('config should export correct CDP port', async () => {
    const { BROWSER } = await import('../scripts/config.mjs');
    assert.ok(BROWSER, 'BROWSER config should exist');
    assert.equal(typeof BROWSER.cdpPort, 'number', 'cdpPort should be a number');
    assert.equal(BROWSER.cdpPort, 9222, 'cdpPort should be 9222');
    assert.ok(BROWSER.cdpEndpoint, 'cdpEndpoint should exist');
    assert.ok(
      BROWSER.cdpEndpoint.includes('9222'),
      `cdpEndpoint should include port 9222, got: ${BROWSER.cdpEndpoint}`
    );
  });
});

describe('start-chrome-debug.sh', () => {
  const scriptPath = path.join(PROJECT_ROOT, 'start-chrome-debug.sh');

  it('should exist', () => {
    assert.ok(existsSync(scriptPath), `file should exist at ${scriptPath}`);
  });

  it('should be executable', () => {
    assert.doesNotThrow(
      () => accessSync(scriptPath, constants.X_OK),
      'script should have execute permission'
    );
  });
});
