import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('deepseek module — prompt 拼接逻辑', () => {
  it('buildPrompt 应将 ANALYSIS_PROMPT 与股票名称拼接', async () => {
    const { buildPrompt } = await import('../scripts/deepseek.mjs');
    const { ANALYSIS_PROMPT } = await import('../scripts/config.mjs');

    const result = buildPrompt('贵州茅台');

    // 应包含原始提示词的开头
    assert.ok(result.startsWith(ANALYSIS_PROMPT), 'prompt should start with ANALYSIS_PROMPT');

    // 应包含股票名称
    assert.ok(result.includes('贵州茅台'), 'prompt should contain stock name');

    // 股票名称应在最后部分
    const lastLine = result.trim().split('\n').pop();
    assert.ok(
      lastLine.includes('贵州茅台'),
      `last line should contain stock name, got: ${lastLine}`
    );
  });

  it('buildPrompt 对不同股票名称生成不同结果', async () => {
    const { buildPrompt } = await import('../scripts/deepseek.mjs');

    const p1 = buildPrompt('贵州茅台');
    const p2 = buildPrompt('五粮液');

    assert.notEqual(p1, p2, 'different stocks should produce different prompts');
    assert.ok(p1.includes('贵州茅台'), 'first prompt should contain 贵州茅台');
    assert.ok(p2.includes('五粮液'), 'second prompt should contain 五粮液');
  });

  it('buildPrompt 输出格式为 "提示词\\n\\n股票名称：XXX"', async () => {
    const { buildPrompt } = await import('../scripts/deepseek.mjs');

    const result = buildPrompt('招商银行');
    const lines = result.split('\n');

    // 倒数第二行应为空行（分隔提示词和股票信息）
    const secondToLast = lines[lines.length - 2];
    assert.equal(secondToLast, '', 'there should be a blank line before stock info');

    // 最后一行应为 "股票名称：招商银行"
    const last = lines[lines.length - 1];
    assert.equal(last, '股票名称：招商银行', 'last line should be stock name label');
  });
});

describe('deepseek module — 回复超时配置', () => {
  it('getTimeoutConfig 应返回正确的超时和轮询间隔', async () => {
    const { getTimeoutConfig } = await import('../scripts/deepseek.mjs');

    const config = getTimeoutConfig();

    assert.equal(typeof config.responseTimeout, 'number', 'responseTimeout should be a number');
    assert.equal(typeof config.pollInterval, 'number', 'pollInterval should be a number');

    assert.equal(config.responseTimeout, 120_000, 'responseTimeout should be 120 seconds');
    assert.equal(config.pollInterval, 3_000, 'pollInterval should be 3 seconds');
  });

  it('超时应大于轮询间隔，且允许至少 30 次轮询', async () => {
    const { getTimeoutConfig } = await import('../scripts/deepseek.mjs');

    const { responseTimeout, pollInterval } = getTimeoutConfig();

    assert.ok(responseTimeout > pollInterval, 'timeout must be greater than poll interval');

    const maxPolls = Math.floor(responseTimeout / pollInterval);
    assert.ok(maxPolls >= 30, `should allow at least 30 polls, got ${maxPolls}`);
  });
});

describe('deepseek module — 回复提取 fallback 策略', () => {
  it('RESPONSE_SELECTORS 应包含多个选择器策略', async () => {
    const { RESPONSE_SELECTORS } = await import('../scripts/deepseek.mjs');

    assert.ok(Array.isArray(RESPONSE_SELECTORS), 'RESPONSE_SELECTORS should be an array');
    assert.ok(RESPONSE_SELECTORS.length >= 2, 'should have at least 2 fallback strategies');
  });

  it('第一个选择器应优先匹配 assistant 消息元素', async () => {
    const { RESPONSE_SELECTORS } = await import('../scripts/deepseek.mjs');

    const primarySelector = RESPONSE_SELECTORS[0];

    // 应包含 DeepSeek 常见的 markdown 容器选择器
    assert.ok(
      primarySelector.includes('assistant') || primarySelector.includes('markdown'),
      `primary selector should target assistant/markdown elements, got: ${primarySelector}`
    );
  });

  it('第二个选择器应作为通用消息 fallback', async () => {
    const { RESPONSE_SELECTORS } = await import('../scripts/deepseek.mjs');

    const fallbackSelector = RESPONSE_SELECTORS[1];

    // 应包含 message 关键词
    assert.ok(
      fallbackSelector.includes('message'),
      `fallback selector should include "message", got: ${fallbackSelector}`
    );
  });

  it('每个选择器都是非空字符串', async () => {
    const { RESPONSE_SELECTORS } = await import('../scripts/deepseek.mjs');

    for (const selector of RESPONSE_SELECTORS) {
      assert.equal(typeof selector, 'string', 'each selector should be a string');
      assert.ok(selector.length > 0, 'each selector should be non-empty');
    }
  });
});
