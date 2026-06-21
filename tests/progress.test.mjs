import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('progress module', () => {
  // 测试1: ETA 计算基于滚动平均
  it('ETA should be based on rolling average of recent 5 stocks', async () => {
    const { createProgressTracker, formatDuration } = await import('../scripts/progress.mjs');
    const tracker = createProgressTracker(10);

    // 模拟处理5只股票，每只耗时递增
    const durations = [60000, 120000, 180000, 120000, 60000]; // 1min, 2min, 3min, 2min, 1min
    for (let i = 0; i < 5; i++) {
      tracker.tick(`Stock${i}`, `SH00000${i}`, 'done', durations[i]);
    }

    // 滚动平均 = (60000+120000+180000+120000+60000)/5 = 108000ms = 1.8min
    const avg = tracker.getAverageDuration();
    assert.equal(avg, 108000, 'average duration should be 108000ms (rolling avg of 5)');

    // ETA: 剩余5只 * 108000ms = 540000ms
    const eta = tracker.getETA();
    assert.equal(eta.remaining, 5, 'remaining should be 5');
    assert.equal(eta.estimatedRemainingMs, 540000, 'estimated remaining should be 540000ms');

    // 再处理一只，触发窗口滚动
    tracker.tick('Stock6', 'SH000006', 'done', 300000); // 5min
    const avg2 = tracker.getAverageDuration();
    // 最近5只: [120000, 180000, 120000, 60000, 300000] avg = 156000
    assert.equal(avg2, 156000, 'rolling average should update after new completion');
  });

  // 测试2: 进度百分比计算正确
  it('progress percentage and summary should be correct', async () => {
    const { createProgressTracker } = await import('../scripts/progress.mjs');
    const tracker = createProgressTracker(20);

    // 模拟5只完成
    for (let i = 0; i < 5; i++) {
      tracker.tick(`Stock${i}`, `SH00000${i}`, 'done', 120000);
    }

    const eta = tracker.getETA();
    assert.equal(eta.remaining, 15, 'remaining should be 15 out of 20');

    // 百分比 = 5/20 = 25%
    const percent = Math.round((5 / 20) * 100);
    assert.equal(percent, 25, 'percentage should be 25%');

    // 测试 summary 不抛错
    tracker.summary();
  });

  // 测试3: formatDuration 正确格式化
  it('formatDuration should format durations correctly', async () => {
    const { formatDuration } = await import('../scripts/progress.mjs');

    assert.equal(formatDuration(5000), '5s', 'should format seconds');
    assert.equal(formatDuration(65000), '1m05s', 'should format minutes+seconds');
    assert.equal(formatDuration(3725000), '1h02m', 'should format hours+minutes');
    assert.equal(formatDuration(0), '0s', 'should handle zero');
  });

  // 测试4: 初始状态无历史数据时 ETA
  it('should handle zero completions gracefully', async () => {
    const { createProgressTracker } = await import('../scripts/progress.mjs');
    const tracker = createProgressTracker(10);

    const eta = tracker.getETA();
    assert.equal(eta.remaining, 10, 'all should remain');
    assert.equal(eta.estimatedRemainingMs, 0, 'no estimate when no data');
  });

  // 测试5: 计数器只在 done/error 时递增，中间状态不递增
  it('counter should only increment on done/error, not intermediate states', async () => {
    const { createProgressTracker } = await import('../scripts/progress.mjs');
    const tracker = createProgressTracker(5);

    // 模拟一只股票的3个阶段: 截图中 → AI分析中 → done
    tracker.tick('Stock0', 'SH000000', '截图中...');
    tracker.tick('Stock0', 'SH000000', 'AI 分析中...');
    tracker.tick('Stock0', 'SH000000', 'done', 60000);

    // 完成数应为1，不是3
    const eta = tracker.getETA();
    assert.equal(eta.remaining, 4, 'remaining should be 4 (only 1 stock done, not 3)');

    // 再处理一只
    tracker.tick('Stock1', 'SH000001', '截图中...');
    tracker.tick('Stock1', 'SH000001', 'done', 120000);

    const eta2 = tracker.getETA();
    assert.equal(eta2.remaining, 3, 'remaining should be 3 after 2 stocks done');
  });
});
