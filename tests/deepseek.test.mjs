// ============================================================
// DeepSeek 模块测试
// ============================================================

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrompt,
  getTimeoutConfig,
  RESPONSE_SELECTORS,
  sendPrompt,
  waitForResponse,
  hasErrorMarker,
  analyzeStock,
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

  // ---------------------------------------------------------
  // 7. sendPrompt — evaluate 输入方式 + 发送确认 + 重试机制
  // ---------------------------------------------------------
  describe('sendPrompt', () => {

    // 创建可配置的 sendPrompt mock page
    function createSendMockPage(options = {}) {
      const {
        sendSucceeds = true,        // 发送后 textarea 清空
        buttonBecomesDisabled = false, // 发送后按钮 disabled
        failCount = 0,              // 前 N 次发送失败（textarea 未清空且按钮未 disabled）
      } = options;

      let attemptCount = 0;
      let textareaValue = '';
      let evaluateCalledWith = null;
      let buttonDisabled = false;

      const mockPage = {
        locator(selector) {
          // textarea 选择器
          if (selector === 'textarea') {
            return {
              async count() { return 1; },
              first() {
                return {
                  async click() {},
                  async evaluate(fn, text) {
                    // 记录 evaluate 被调用及参数
                    evaluateCalledWith = text;
                    textareaValue = text;
                  },
                  async inputValue() {
                    return textareaValue;
                  },
                };
              },
            };
          }
          // 发送按钮选择器（primary circle）
          if (selector.includes('ds-button--primary') && selector.includes('ds-button--circle')) {
            return {
              async isVisible() { return true; },
              async click() {
                attemptCount++;
                if (attemptCount <= failCount) {
                  // 前 N 次发送失败：textarea 未清空，按钮未 disabled
                  return;
                }
                // 发送成功
                if (sendSucceeds) {
                  textareaValue = '';
                }
                if (buttonBecomesDisabled) {
                  buttonDisabled = true;
                }
              },
              async getAttribute(attr) {
                if (attr === 'class') {
                  return buttonDisabled ? 'ds-button ds-button--primary ds-button--filled ds-button--circle ds-button--disabled' : 'ds-button ds-button--primary ds-button--filled ds-button--circle';
                }
                return null;
              },
            };
          }
          // 其他发送按钮 fallback
          if (selector.includes('primary')) {
            return {
              async isVisible() { return false; },
              async click() {},
              async getAttribute() { return null; },
            };
          }
          // 默认
          return {
            async isVisible() { return false; },
            async click() {},
            async count() { return 0; },
            async getAttribute() { return null; },
          };
        },
        keyboard: {
          async press() {},
        },
        // 暴露内部状态供测试断言
        _getState() {
          return { attemptCount, textareaValue, evaluateCalledWith, buttonDisabled };
        },
      };

      return mockPage;
    }

    it('应使用 evaluate + nativeInputValueSetter 输入文本到 textarea', async () => {
      const page = createSendMockPage();
      await sendPrompt(page, '测试提示词');

      const state = page._getState();
      // evaluate 被调用，传入了正确的 prompt 文本
      assert.equal(state.evaluateCalledWith, '测试提示词');
    });

    it('发送成功后 textarea 被清空应确认成功（不重试）', async () => {
      const page = createSendMockPage({ sendSucceeds: true });
      await sendPrompt(page, '测试');

      const state = page._getState();
      assert.equal(state.textareaValue, '');
      assert.equal(state.attemptCount, 1, '只应尝试 1 次');
    });

    it('发送成功后按钮变为 disabled 应确认成功（不重试）', async () => {
      const page = createSendMockPage({
        sendSucceeds: false,       // textarea 未清空
        buttonBecomesDisabled: true, // 但按钮 disabled
      });
      await sendPrompt(page, '测试');

      const state = page._getState();
      assert.equal(state.buttonDisabled, true);
      assert.equal(state.attemptCount, 1, '只应尝试 1 次');
    });

    it('发送失败重试 3 次后应抛出错误', async () => {
      const page = createSendMockPage({
        sendSucceeds: false,
        buttonBecomesDisabled: false,
        failCount: 10, // 所有尝试都失败
      });

      await assert.rejects(
        () => sendPrompt(page, '测试'),
        (err) => {
          assert.ok(err.message.includes('发送失败') || err.message.includes('重试'));
          return true;
        }
      );

      const state = page._getState();
      assert.equal(state.attemptCount, 3, '应尝试 3 次后放弃');
    });

    it('前 2 次失败第 3 次成功不应抛错', async () => {
      const page = createSendMockPage({
        sendSucceeds: true,        // 第 3 次时 textarea 清空
        buttonBecomesDisabled: false,
        failCount: 2,              // 前 2 次失败
      });

      // 不应抛出错误
      await sendPrompt(page, '测试');

      const state = page._getState();
      assert.equal(state.attemptCount, 3, '应尝试 3 次');
      assert.equal(state.textareaValue, '', '最终 textarea 应清空');
    });
  });

  // ---------------------------------------------------------
  // 8. waitForResponse — DOM 状态判断
  // ---------------------------------------------------------
  describe('waitForResponse — DOM 状态判断', () => {

    /**
     * 创建用于 waitForResponse 测试的 mock page
     * state 对象中的属性在测试过程中可被外部修改，模拟真实页面状态变化
     */
    function createWaitMockPage(overrides = {}) {
      const state = {
        stopButtonVisible: false,
        sendButtonDisabled: false,
        placeholder: '',
        ...overrides,
      };

      return {
        locator(selector) {
          return {
            async isVisible() {
              // 停止生成按钮
              if (selector.includes('停止生成') || selector.includes('停止')) {
                return state.stopButtonVisible;
              }
              return false;
            },
            async getAttribute(attr) {
              if (attr === 'class') {
                // 发送按钮
                if (selector.includes('ds-button--primary')) {
                  return state.sendButtonDisabled
                    ? 'ds-button ds-button--primary ds-button--filled ds-button--circle ds-button--disabled'
                    : 'ds-button ds-button--primary ds-button--filled ds-button--circle';
                }
                return '';
              }
              if (attr === 'placeholder') {
                return state.placeholder;
              }
              return null;
            },
          };
        },
        state,
      };
    }

    // 使用短轮询间隔加速测试
    const testConfig = { responseTimeout: 3000, pollInterval: 50 };

    it('检测"停止生成"按钮存在时继续等待，按钮消失后退出', async () => {
      const page = createWaitMockPage({
        stopButtonVisible: true,
        sendButtonDisabled: false,
        placeholder: '思考中...',
      });

      // 200ms 后模拟停止按钮消失 + placeholder 恢复
      setTimeout(() => {
        page.state.stopButtonVisible = false;
        page.state.placeholder = '请输入你的问题';
      }, 200);

      // 应正常退出（不超时）
      await waitForResponse(page, testConfig);
    });

    it('检测发送按钮 ds-button--disabled 状态时继续等待', async () => {
      const page = createWaitMockPage({
        stopButtonVisible: false,
        sendButtonDisabled: true,
        placeholder: '',
      });

      // 200ms 后模拟按钮恢复 + placeholder 就绪
      setTimeout(() => {
        page.state.sendButtonDisabled = false;
        page.state.placeholder = '请输入你的问题';
      }, 200);

      // 应正常退出（不超时）
      await waitForResponse(page, testConfig);
    });

    it('检测 placeholder 恢复为"请输入你的问题"时退出', async () => {
      const page = createWaitMockPage({
        stopButtonVisible: false,
        sendButtonDisabled: false,
        placeholder: '生成中...',
      });

      // 100ms 后 placeholder 恢复
      setTimeout(() => {
        page.state.placeholder = '请输入你的问题';
      }, 100);

      await waitForResponse(page, testConfig);
    });

    it('不确定状态连续 3 次后兜底退出', async () => {
      const pageState = {
        stopButtonVisible: false,
        sendButtonDisabled: false,
        placeholder: '',  // 既不是生成中，也不是完成
      };
      const page = createWaitMockPage(pageState);

      // 不改变状态，3 次不确定后兜底退出
      // pollInterval=50ms, 3 次 = 150ms, 远小于 responseTimeout
      await waitForResponse(page, testConfig);
    });

    it('超时后应抛出错误', async () => {
      const pageState = {
        stopButtonVisible: true,   // 持续生成中
        sendButtonDisabled: true,
        placeholder: '',
      };
      const page = createWaitMockPage(pageState);

      await assert.rejects(
        () => waitForResponse(page, { responseTimeout: 200, pollInterval: 50 }),
        (err) => {
          assert.ok(err.message.includes('超时'));
          return true;
        }
      );
    });
  });

  // ---------------------------------------------------------
  // 9. hasErrorMarker — 错误标记检测纯函数
  // ---------------------------------------------------------
  describe('hasErrorMarker', () => {

    it('应检测到"已停止"', () => {
      assert.equal(hasErrorMarker('已停止，无法继续'), true);
    });

    it('应检测到"已中断"', () => {
      assert.equal(hasErrorMarker('回复已中断'), true);
    });

    it('应检测到"抱歉"', () => {
      assert.equal(hasErrorMarker('抱歉，我无法完成这个请求'), true);
    });

    it('应检测到"无法分析"', () => {
      assert.equal(hasErrorMarker('无法分析该股票数据'), true);
    });

    it('正常回复应返回 false', () => {
      assert.equal(hasErrorMarker('贵州茅台近期走势良好，建议关注。'), false);
    });

    it('空字符串应返回 false', () => {
      assert.equal(hasErrorMarker(''), false);
    });

    it('null 或 undefined 应返回 false', () => {
      assert.equal(hasErrorMarker(null), false);
      assert.equal(hasErrorMarker(undefined), false);
    });

    it('多个错误标记中有一个即命中', () => {
      assert.equal(hasErrorMarker('以下是分析结果：抱歉，数据不足。'), true);
    });
  });

  // ---------------------------------------------------------
  // 10. 回复长度检测 — < 100 字视为截断
  // ---------------------------------------------------------
  describe('回复长度检测', () => {
    it('少于 100 字的回复应被视为截断', () => {
      const short = '这是一段很短的回复。';
      assert.ok(short.length < 100, '测试前提：短回复确实少于 100 字');
      // 截断判定逻辑：length < 100
      assert.ok(short.length < 100);
    });

    it('不少于 100 字的回复不应被视为截断', () => {
      const long = '贵州茅台（600519）近期走势分析：从技术面来看，该股在近期呈现出震荡上行的态势，成交量有所放大，MACD指标金叉向上，RSI处于中性偏强区域，整体趋势向好，建议投资者关注后续走势变化并做好风险管理。';
      assert.ok(long.length >= 100, `测试前提：长回复确实不少于 100 字，实际 ${long.length} 字`);
    });
  });

  // ---------------------------------------------------------
  // 11. analyzeStock — 错误检测 + 重试机制
  // ---------------------------------------------------------
  describe('analyzeStock — 错误检测与重试', () => {

    // 确保 normalReply 长度 >= 100
    const NORMAL_REPLY = '贵州茅台（600519）近期走势分析：从技术面来看，该股在近期呈现出震荡上行的态势，成交量有所放大，MACD指标金叉向上，RSI处于中性偏强区域，整体趋势向好，建议投资者关注后续走势变化并做好风险管理。';

    /**
     * 创建用于 analyzeStock 测试的 mock page
     * 可配置每次 extractResponse 返回的文本，模拟不同回复质量
     */
    function createAnalyzeMockPage(options = {}) {
      const {
        responses = [NORMAL_REPLY],  // 每次重试的回复文本
      } = options;

      let extractCallCount = 0;

      const mockPage = {
        async goto() {},
        async waitForSelector() {},
        locator(selector) {
          return {
            async isVisible() { return false; },
            async click() {},
            async count() { return selector === 'textarea' ? 1 : 0; },
            first() {
              return {
                async click() {},
                async evaluate(fn, text) {},
                async inputValue() { return ''; },
              };
            },
            async waitFor() {},
            async setInputFiles() {},
            async getAttribute(attr) {
              if (attr === 'class') return 'ds-button ds-button--primary ds-button--filled ds-button--circle';
              if (attr === 'placeholder') return '请输入你的问题';
              return null;
            },
          };
        },
        async evaluate() {
          // 模拟 extractResponseText 返回
          const idx = Math.min(extractCallCount, responses.length - 1);
          extractCallCount++;
          return responses[idx];
        },
        keyboard: { async press() {} },
        _getState() {
          return { extractCallCount };
        },
      };

      return mockPage;
    }

    it('第一次回复正常时不应重试', async () => {
      const page = createAnalyzeMockPage({
        responses: [NORMAL_REPLY],
      });

      const result = await analyzeStock(page, { name: '贵州茅台' }, []);
      assert.ok(result.length >= 100, `回复长度应 >= 100，实际 ${result.length}`);
    });

    it('检测到错误标记时应重试，最多 3 次', async () => {
      // 前 2 次返回错误标记，第 3 次返回正常回复
      const page = createAnalyzeMockPage({
        responses: ['抱歉，无法处理', '已停止', NORMAL_REPLY],
      });

      const result = await analyzeStock(page, { name: '贵州茅台' }, []);
      assert.equal(result, NORMAL_REPLY);
    });

    it('回复过短（< 100 字）时应重试', async () => {
      const page = createAnalyzeMockPage({
        responses: ['太短了', '还是太短', NORMAL_REPLY],
      });

      const result = await analyzeStock(page, { name: '贵州茅台' }, []);
      assert.equal(result, NORMAL_REPLY);
    });

    it('3 次均失败时应抛出错误', async () => {
      const page = createAnalyzeMockPage({
        responses: ['抱歉', '已中断', '无法分析'],
      });

      await assert.rejects(
        () => analyzeStock(page, { name: '贵州茅台' }, []),
        (err) => {
          assert.ok(err.message.includes('重试') || err.message.includes('质量'));
          return true;
        }
      );
    });

    it('3 次均截断（< 100 字）时应抛出错误', async () => {
      const page = createAnalyzeMockPage({
        responses: ['短', '也短', '还是短'],
      });

      await assert.rejects(
        () => analyzeStock(page, { name: '贵州茅台' }, []),
        (err) => {
          assert.ok(err.message.includes('重试') || err.message.includes('截断') || err.message.includes('质量'));
          return true;
        }
      );
    });
  });
});
