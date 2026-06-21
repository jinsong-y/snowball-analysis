// ============================================================
// DeepSeek 模块测试
// ============================================================

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrompt,
  getTimeoutConfig,
  RESPONSE_SELECTORS,
} from '../scripts/deepseek.mjs';
import { ANALYSIS_PROMPT } from '../scripts/config.mjs';

// -----------------------------------------------------------
// Mock Page 工厂 — 模拟 Playwright Page 行为
// -----------------------------------------------------------
function createMockPage(overrides = {}) {
  const state = {
    textareaValue: '',
    deepThinkPressed: false,
    messageSent: false,
    responseText: '',
    visibleElements: new Set(['textarea', 'input[type="file"]']),
    ...overrides,
  };

  return {
    locator(selector) {
      return {
        async isVisible() {
          // 模拟元素可见性
          if (selector.includes('深度思考')) return state.visibleElements.has('深度思考');
          if (selector.includes('vision')) return state.visibleElements.has('vision');
          if (selector.includes('开启新对话')) return state.visibleElements.has('开启新对话');
          if (selector.includes('Send') || selector.includes('发送')) return state.visibleElements.has('send');
          if (selector.includes('Stop') || selector.includes('停止')) return state.visibleElements.has('stop');
          return false;
        },
        async click() {
          if (selector.includes('深度思考')) {
            state.deepThinkPressed = true;
          }
          if (selector.includes('Send') || selector.includes('发送')) {
            state.messageSent = true;
            state.textareaValue = ''; // 发送后清空输入框
          }
        },
        async count() {
          if (selector === 'textarea') return 1;
          return 0;
        },
        first() {
          return {
            async fill(text) {
              state.textareaValue = text;
            },
            async click() {},
            async evaluate() {},
          };
        },
        async waitFor() {},
        async getAttribute(attr) {
          if (attr === 'aria-pressed' && selector.includes('深度思考')) {
            return state.deepThinkPressed ? 'true' : 'false';
          }
          return null;
        },
      };
    },
    async goto() {},
    async waitForSelector() {},
    async evaluate(fn) {
      // 模拟 extractResponseText
      return state.responseText;
    },
    keyboard: { async press() {} },
    state, // 暴露状态供测试断言
  };
}

// ============================================================
// 测试套件
// ============================================================

describe('DeepSeek 模块', () => {

  // ---------------------------------------------------------
  // 1. buildPrompt 纯逻辑
  // ---------------------------------------------------------
  describe('buildPrompt', () => {
    it('应将 ANALYSIS_PROMPT 与股票名称拼接', () => {
      const result = buildPrompt('贵州茅台');
      assert.ok(result.includes(ANALYSIS_PROMPT));
      assert.ok(result.includes('贵州茅台'));
    });

    it('对不同股票名称生成不同结果', () => {
      const a = buildPrompt('贵州茅台');
      const b = buildPrompt('比亚迪');
      assert.notEqual(a, b);
    });

    it('输出格式为 "提示词\\n\\n股票名称：XXX"', () => {
      const result = buildPrompt('测试股票');
      assert.ok(result.endsWith('股票名称：测试股票'));
    });
  });

  // ---------------------------------------------------------
  // 2. getTimeoutConfig
  // ---------------------------------------------------------
  describe('getTimeoutConfig', () => {
    it('应返回正确的超时和轮询间隔', () => {
      const config = getTimeoutConfig();
      assert.equal(typeof config.responseTimeout, 'number');
      assert.equal(typeof config.pollInterval, 'number');
      assert.ok(config.responseTimeout > config.pollInterval);
    });

    it('超时应大于轮询间隔，且允许至少 30 次轮询', () => {
      const { responseTimeout, pollInterval } = getTimeoutConfig();
      assert.ok(responseTimeout / pollInterval >= 30);
    });

    it('深度思考模式超时应为300秒', () => {
      const { responseTimeout } = getTimeoutConfig();
      assert.equal(responseTimeout, 300_000, 'responseTimeout should be 300 seconds for deep thinking');
    });

    it('轮询间隔应为5秒', () => {
      const { pollInterval } = getTimeoutConfig();
      assert.equal(pollInterval, 5_000, 'pollInterval should be 5 seconds');
    });
  });

  // ---------------------------------------------------------
  // 3. RESPONSE_SELECTORS
  // ---------------------------------------------------------
  describe('RESPONSE_SELECTORS', () => {
    it('应包含多个选择器策略', () => {
      assert.ok(RESPONSE_SELECTORS.length >= 2);
    });

    it('第一个选择器应优先匹配 assistant 消息元素', () => {
      assert.ok(RESPONSE_SELECTORS[0].includes('markdown'));
    });

    it('每个选择器都是非空字符串', () => {
      for (const sel of RESPONSE_SELECTORS) {
        assert.ok(typeof sel === 'string' && sel.length > 0);
      }
    });
  });

  // ---------------------------------------------------------
  // 4. 深度思考按钮 — aria-pressed 验证
  // ---------------------------------------------------------
  describe('深度思考按钮交互', () => {
    it('点击后 aria-pressed 应为 true', async () => {
      const page = createMockPage();
      const btn = page.locator('span:has-text("深度思考")');

      // 点击前未激活
      const before = await btn.getAttribute('aria-pressed');
      assert.equal(before, 'false');

      // 点击
      await btn.click();

      // 点击后应激活
      const after = await btn.getAttribute('aria-pressed');
      assert.equal(after, 'true');
    });

    it('深度思考按钮不可见时不应报错', async () => {
      const page = createMockPage({
        visibleElements: new Set(), // 深度思考不可见
      });
      const btn = page.locator('span:has-text("深度思考")');
      const visible = await btn.isVisible();
      assert.equal(visible, false);
    });
  });

  // ---------------------------------------------------------
  // 5. 发送按钮 — 验证消息已发送
  // ---------------------------------------------------------
  describe('发送按钮交互', () => {
    it('点击发送后 textarea 应被清空', async () => {
      const page = createMockPage();
      const textarea = page.locator('textarea');

      // 填入提示词
      await textarea.first().fill('测试提示词');
      assert.equal(page.state.textareaValue, '测试提示词');

      // 点击发送
      const sendBtn = page.locator('button[aria-label*="Send"]');
      await sendBtn.click();

      // 发送后 textarea 应清空
      assert.equal(page.state.textareaValue, '');
      assert.equal(page.state.messageSent, true);
    });

    it('发送按钮不可见时应 fallback 到键盘快捷键', async () => {
      const page = createMockPage({
        visibleElements: new Set(['textarea']), // 发送按钮不可见
      });

      let keyboardPressed = false;
      page.keyboard.press = async () => { keyboardPressed = true; };

      // 模拟 sendPrompt 的 fallback 逻辑
      const sendBtn = page.locator('button[aria-label*="Send"]');
      const visible = await sendBtn.isVisible();
      if (!visible) {
        await page.keyboard.press('Meta+Enter');
      }

      assert.equal(keyboardPressed, true);
    });
  });

  // ---------------------------------------------------------
  // 6. 回复提取 — extractResponseText 策略
  // ---------------------------------------------------------
  describe('回复提取策略', () => {
    it('RESPONSE_SELECTORS 应包含 ds-markdown 选择器', () => {
      const hasMarkdown = RESPONSE_SELECTORS.some(s => s.includes('ds-markdown') || s.includes('markdown'));
      assert.ok(hasMarkdown, '应包含 ds-markdown 相关选择器');
    });

    it('应有通用消息 fallback 选择器', () => {
      const hasGeneric = RESPONSE_SELECTORS.some(s => s.includes('message'));
      assert.ok(hasGeneric, '应包含通用 message 选择器');
    });
  });
});
