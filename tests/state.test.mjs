import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const TEST_DATE = '2026-01-20';

// 清理状态文件
async function cleanup() {
  const statePath = path.join(PROJECT_ROOT, `state-${TEST_DATE}.json`);
  try { await fs.unlink(statePath); } catch {}
}

describe('state module', () => {
  before(async () => { await cleanup(); });
  after(async () => { await cleanup(); });

  // 测试1: 初始化状态文件结构正确
  it('loadState should return correct initial structure when file does not exist', async () => {
    const { loadState } = await import('../scripts/state.mjs');
    const state = await loadState(TEST_DATE);

    assert.equal(state.date, TEST_DATE, 'date should match');
    assert.ok(typeof state.stocks === 'object', 'stocks should be an object');
    assert.equal(Object.keys(state.stocks).length, 0, 'stocks should be empty initially');
  });

  // 测试2: 状态流转逻辑正确
  it('updateStockStatus should correctly transition through states', async () => {
    const { loadState, updateStockStatus, saveState } = await import('../scripts/state.mjs');
    const state = await loadState(TEST_DATE);

    // 初始: pending
    updateStockStatus(state, 'SZ300319', 'pending', { name: '麦捷科技' });
    assert.equal(state.stocks['SZ300319'].status, 'pending');
    assert.equal(state.stocks['SZ300319'].name, '麦捷科技');

    // 流转: pending -> screenshots_done
    updateStockStatus(state, 'SZ300319', 'screenshots_done', { screenshots: { day: '/path/day.png', week: '/path/week.png' } });
    assert.equal(state.stocks['SZ300319'].status, 'screenshots_done');
    assert.ok(state.stocks['SZ300319'].screenshots, 'screenshots should be set');

    // 流转: screenshots_done -> analyzing
    updateStockStatus(state, 'SZ300319', 'analyzing');
    assert.equal(state.stocks['SZ300319'].status, 'analyzing');

    // 流转: analyzing -> done
    updateStockStatus(state, 'SZ300319', 'done', { resultFile: '/results/output.md' });
    assert.equal(state.stocks['SZ300319'].status, 'done');
    assert.equal(state.stocks['SZ300319'].resultFile, '/results/output.md');
    assert.ok(state.stocks['SZ300319'].updatedAt, 'updatedAt should be set');

    await saveState(state, TEST_DATE);
  });

  // 测试3: analyzing 状态重启后正确重置为 screenshots_done
  it('loadState should reset analyzing status to screenshots_done on restart', async () => {
    // 直接写一个包含 analyzing 状态的文件
    const statePath = path.join(PROJECT_ROOT, `state-${TEST_DATE}.json`);
    const stateData = {
      date: TEST_DATE,
      stocks: {
        'SH600519': { name: '贵州茅台', status: 'done', updatedAt: '2026-01-20T10:00:00Z' },
        'SZ000858': { name: '五粮液', status: 'analyzing', updatedAt: '2026-01-20T10:05:00Z' },
        'SZ000333': { name: '美的集团', status: 'screenshots_done', updatedAt: '2026-01-20T10:03:00Z' },
      }
    };
    await fs.writeFile(statePath, JSON.stringify(stateData, null, 2), 'utf-8');

    const { loadState } = await import('../scripts/state.mjs');
    const state = await loadState(TEST_DATE);

    // done 保持不变
    assert.equal(state.stocks['SH600519'].status, 'done', 'done should remain done');

    // analyzing 重置为 screenshots_done
    assert.equal(state.stocks['SZ000858'].status, 'screenshots_done', 'analyzing should be reset to screenshots_done');

    // screenshots_done 保持不变
    assert.equal(state.stocks['SZ000333'].status, 'screenshots_done', 'screenshots_done should remain');
  });

  // 测试4: getPendingStocks 正确过滤已完成的
  it('getPendingStocks should filter out done stocks', async () => {
    const { loadState, getPendingStocks } = await import('../scripts/state.mjs');
    const state = await loadState(TEST_DATE);

    // 上一个测试留下的数据: SH600519=done, SZ000858=screenshots_done, SZ000333=screenshots_done
    const pending = getPendingStocks(state);

    assert.equal(pending.length, 2, 'should have 2 pending stocks (not done)');
    const codes = pending.map(s => s.code);
    assert.ok(!codes.includes('SH600519'), 'done stock should be filtered out');
    assert.ok(codes.includes('SZ000858'), 'screenshots_done stock should be included');
    assert.ok(codes.includes('SZ000333'), 'screenshots_done stock should be included');
  });
});
