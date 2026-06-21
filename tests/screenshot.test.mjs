import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, 'screenshots');

// 用于测试后清理的临时目录
const TEMP_DIR = path.join(PROJECT_ROOT, 'screenshots_test_tmp');

describe('screenshot module', () => {
  // ---- 测试1: 文件名生成逻辑 ----
  it('should generate correct filename format', async () => {
    const { buildFilename } = await import('../scripts/screenshot.mjs');

    const date = '2026-06-21';
    const stock = { code: 'SZ300319', name: '麦捷科技' };
    const index = 0;

    const dayName = buildFilename(date, stock, index, '日K');
    const weekName = buildFilename(date, stock, index, '周K');

    assert.equal(dayName, '2026-06-21_01_SZ300319_麦捷科技_日K.png');
    assert.equal(weekName, '2026-06-21_01_SZ300319_麦捷科技_周K.png');
  });

  it('should pad index to 2 digits', async () => {
    const { buildFilename } = await import('../scripts/screenshot.mjs');

    const date = '2026-06-21';
    const stock = { code: 'SH600519', name: '贵州茅台' };

    assert.equal(buildFilename(date, stock, 0, '日K'), '2026-06-21_01_SH600519_贵州茅台_日K.png');
    assert.equal(buildFilename(date, stock, 9, '日K'), '2026-06-21_10_SH600519_贵州茅台_日K.png');
    assert.equal(buildFilename(date, stock, 49, '日K'), '2026-06-21_50_SH600519_贵州茅台_日K.png');
  });

  it('should sanitize special characters in stock name', async () => {
    const { buildFilename } = await import('../scripts/screenshot.mjs');

    const date = '2026-06-21';
    const stock = { code: 'SZ000001', name: 'ST某某/测试*股份' };
    const name = buildFilename(date, stock, 0, '日K');

    // 不应包含文件系统非法字符
    assert.ok(!name.includes('/'), 'should not contain /');
    assert.ok(!name.includes('*'), 'should not contain *');
    assert.ok(name.endsWith('_日K.png'), 'should end with _日K.png');
  });

  // ---- 测试2: 返回对象包含 dayScreenshot 和 weekScreenshot 路径 ----
  it('should return object with dayScreenshot and weekScreenshot keys', async () => {
    const { buildResult } = await import('../scripts/screenshot.mjs');

    const result = buildResult(SCREENSHOTS_DIR, '2026-06-21', { code: 'SZ300319', name: '麦捷科技' }, 0);

    assert.ok('dayScreenshot' in result, 'result should have dayScreenshot');
    assert.ok('weekScreenshot' in result, 'result should have weekScreenshot');

    assert.ok(result.dayScreenshot.endsWith('2026-06-21_01_SZ300319_麦捷科技_日K.png'));
    assert.ok(result.weekScreenshot.endsWith('2026-06-21_01_SZ300319_麦捷科技_周K.png'));

    // 路径应该是绝对路径
    assert.ok(path.isAbsolute(result.dayScreenshot), 'dayScreenshot should be absolute path');
    assert.ok(path.isAbsolute(result.weekScreenshot), 'weekScreenshot should be absolute path');
  });

  // ---- 测试3: 截图目录不存在时自动创建 ----
  it('should create screenshots directory if it does not exist', async () => {
    const { ensureScreenshotDir } = await import('../scripts/screenshot.mjs');

    // 确保测试目录不存在
    try {
      await fs.rm(TEMP_DIR, { recursive: true, force: true });
    } catch {}

    assert.ok(
      !(await exists(TEMP_DIR)),
      `temp dir should not exist before test: ${TEMP_DIR}`
    );

    await ensureScreenshotDir(TEMP_DIR);

    assert.ok(await exists(TEMP_DIR), 'directory should be created');

    // 调用第二次不应报错
    await ensureScreenshotDir(TEMP_DIR);
    assert.ok(await exists(TEMP_DIR), 'directory should still exist after second call');

    // 清理
    await fs.rm(TEMP_DIR, { recursive: true, force: true });
  });
});

// ---- 工具 ----
async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
