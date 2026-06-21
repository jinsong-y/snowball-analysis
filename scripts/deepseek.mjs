// ============================================================
// DeepSeek AI 分析集成模块
// ============================================================

import { DEEPSEEK, ANALYSIS_PROMPT } from './config.mjs';

// -----------------------------------------------------------
// 工具：等待指定毫秒
// -----------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -----------------------------------------------------------
// 1. openNewChat — 导航到 DeepSeek，开启新对话，选择视觉模型，开启深度思考
// -----------------------------------------------------------
export async function openNewChat(page) {
  await page.goto(DEEPSEEK.chatUrl, { waitUntil: 'domcontentloaded' });
  // 等待页面主要交互元素加载
  await page.waitForSelector('textarea, [contenteditable="true"]', {
    timeout: 30_000,
  });
  await sleep(2000);

  // 1. 点击"开启新对话" span
  const newChatSpan = page.locator('span:has-text("开启新对话")');
  if (await newChatSpan.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await newChatSpan.click();
    await sleep(2000);
    console.log('  ✓ 已开启新对话');
  }

  // 2. 选择视觉模型 (data-model-type="vision")
  const visionModel = page.locator('[data-model-type="vision"]');
  if (await visionModel.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await visionModel.click();
    await sleep(1500);
    console.log('  ✓ 已选择视觉模型');
  }

  // 3. 确认"深度思考"已激活（默认可能是激活状态，不要重复点击！）
  // DeepSeek 深度思考按钮: div.ds-toggle-button.ds-toggle-button--selected
  const deepThinkBtn = page.locator('div.ds-toggle-button:has-text("深度思考")');
  if (await deepThinkBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    const cls = await deepThinkBtn.getAttribute('class').catch(() => '');
    const pressed = await deepThinkBtn.getAttribute('aria-pressed').catch(() => null);

    const isSelected = (cls && cls.includes('selected')) || pressed === 'true';

    if (isSelected) {
      console.log('  ✓ 深度思考已激活（默认状态，无需点击）');
    } else {
      // 未激活，点击开启
      await deepThinkBtn.click();
      await sleep(1500);
      const newCls = await deepThinkBtn.getAttribute('class').catch(() => '');
      const newPressed = await deepThinkBtn.getAttribute('aria-pressed').catch(() => null);
      if ((newCls && newCls.includes('selected')) || newPressed === 'true') {
        console.log('  ✓ 深度思考已开启');
      } else {
        console.log('  ⚠ 深度思考点击后未确认激活');
      }
    }
  } else {
    console.log('  ⚠ 未找到深度思考按钮');
  }
}

// -----------------------------------------------------------
// 2. uploadScreenshots — 通过 input[type=file] 上传截图
// -----------------------------------------------------------
export async function uploadScreenshots(page, filePaths) {
  if (!filePaths || filePaths.length === 0) return;

  // 等待文件上传入口出现
  const fileInput = page.locator('input[type="file"]');
  await fileInput.waitFor({ state: 'attached', timeout: 10_000 });

  // setInputFiles 支持数组一次性多文件上传
  await fileInput.setInputFiles(filePaths);

  // 等待上传完成（文件预览出现）
  await sleep(2_000);
}

// -----------------------------------------------------------
// 3. sendPrompt — 在输入框填写提示词并发送
// -----------------------------------------------------------
export async function sendPrompt(page, prompt) {
  // 找到输入框
  const textarea = page.locator('textarea');
  if (await textarea.count() === 0) {
    throw new Error('找不到 DeepSeek textarea 输入框');
  }

  // 用 click + type 而非 fill — 确保触发 React 状态更新
  await textarea.first().click();
  await sleep(300);
  // 先清空
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Backspace');
  await sleep(200);
  // 逐段输入（playwright 的 type 会触发 keydown/input 事件）
  await textarea.first().type(prompt, { delay: 5 });
  await sleep(500);

  // 验证输入框有内容
  const inputVal = await textarea.first().inputValue().catch(() => '');
  if (inputVal.length === 0) {
    console.log('  ⚠ 输入框为空，尝试 evaluate 方式填入');
    await textarea.first().evaluate((el, text) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      ).set;
      nativeInputValueSetter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, prompt);
    await sleep(500);
  }

  // 尝试多种方式找到并点击发送按钮
  // DeepSeek 实际发送按钮: div[role="button"].ds-button--primary.ds-button--filled.ds-button--circle
  let sent = false;

  // 策略1: DeepSeek 主发送按钮（primary + filled + circle）
  const sendBtn1 = page.locator('div[role="button"].ds-button--primary.ds-button--filled.ds-button--circle');
  if (await sendBtn1.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await sendBtn1.click();
    sent = true;
    console.log('  ✓ 通过 ds-button--primary 发送');
  }

  // 策略2: 任何 role=button 且含 primary 的按钮
  if (!sent) {
    const sendBtn2 = page.locator('div[role="button"][class*="primary"]');
    if (await sendBtn2.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await sendBtn2.click();
      sent = true;
      console.log('  ✓ 通过 primary 按钮发送');
    }
  }

  // 策略3: 键盘快捷键
  if (!sent) {
    await page.keyboard.press('Meta+Enter');
    sent = true;
    console.log('  ✓ 通过 Meta+Enter 发送');
  }

  // 验证消息已发送：等待 textarea 清空
  if (sent) {
    await sleep(1000);
    const textareaContent = await page.locator('textarea').first().inputValue().catch(() => '');
    if (textareaContent.length > 0) {
      console.log('  ⚠ 发送后 textarea 未清空，消息可能未发出');
    }
  }
}

// -----------------------------------------------------------
// 4. waitForResponse — 轮询等待 AI 回复完成（支持深度思考模式）
// -----------------------------------------------------------
export async function waitForResponse(page) {
  const { responseTimeout, pollInterval } = DEEPSEEK;
  const deadline = Date.now() + responseTimeout;

  let stableCount = 0;
  let lastLen = 0;

  console.log('  等待AI回复（深度思考模式，最长5分钟）...');

  while (Date.now() < deadline) {
    await sleep(pollInterval);

    // 检查是否仍在生成
    // "停止"按钮可见 = 仍在生成或思考中
    const stopBtn = page.locator(
      'button:has-text("Stop"), button:has-text("停止"), div[role="button"]:has-text("Stop"), div[role="button"]:has-text("停止")'
    );
    const isGenerating = await stopBtn.isVisible({ timeout: 500 }).catch(() => false);

    // 检查"思考中"状态（深度思考模式会有思考过程展示）
    const thinkingIndicator = page.locator(
      'span:has-text("思考中"), span:has-text("Thinking"), [class*="thinking"]'
    );
    const isThinking = await thinkingIndicator.isVisible({ timeout: 300 }).catch(() => false);

    // 检查"已深度思考"（思考完成但回复还在生成）
    const thoughtDone = page.locator(
      'span:has-text("已深度思考"), span:has-text("思考完成")'
    );
    const isThoughtDone = await thoughtDone.isVisible({ timeout: 300 }).catch(() => false);

    if (isGenerating || isThinking) {
      stableCount = 0;
      if (isThinking) {
        console.log('  ... 思考中...');
      }
      continue;
    }

    // 读取最后一条 assistant 回复的长度
    const text = await extractResponseText(page);
    const currentLen = text.length;

    if (currentLen > 0 && currentLen === lastLen) {
      stableCount++;
      if (stableCount >= 3) {
        console.log('  ✓ AI回复完成');
        return; // 连续 3 次无变化，视为完成
      }
    } else {
      stableCount = 0;
    }
    lastLen = currentLen;
  }

  throw new Error(`DeepSeek 回复超时（${responseTimeout / 1000}秒）`);
}

// -----------------------------------------------------------
// 5. extractResponse — 提取最后一条 AI 回复的完整文本
// -----------------------------------------------------------
export async function extractResponse(page) {
  const text = await extractResponseText(page);
  if (!text) {
    throw new Error('未能从 DeepSeek 页面提取到 AI 回复内容');
  }
  return text;
}

// -----------------------------------------------------------
// 内部：从 DOM 提取最后一条 assistant 消息文本
//   多策略 fallback
// -----------------------------------------------------------
async function extractResponseText(page) {
  return page.evaluate(() => {
    // 侧边栏关键词
    const SIDEBAR_KEYWORDS = ['开启新对话', '今天', '昨天', '7 天内', '30 天内', '热门话题', 'Trending'];

    function isSidebarText(text) {
      let matchCount = 0;
      for (const kw of SIDEBAR_KEYWORDS) {
        if (text.includes(kw)) matchCount++;
      }
      return matchCount >= 2;
    }

    // 策略 1: ds-assistant-message-main-content — 最终回复（不含思考过程）
    const mainContents = document.querySelectorAll('.ds-assistant-message-main-content');
    if (mainContents.length > 0) {
      const last = mainContents[mainContents.length - 1];
      const text = last.innerText?.trim();
      if (text && text.length > 0) return text;
    }

    // 策略 2: div.ds-message — assistant 消息容器（含思考+回复）
    const dsMessages = document.querySelectorAll('div.ds-message');
    for (let i = dsMessages.length - 1; i >= 0; i--) {
      const text = dsMessages[i].innerText?.trim();
      // 排除用户消息（不包含"已思考"或 markdown 内容）
      if (text && text.length > 10 && !isSidebarText(text)) {
        // 如果包含"已思考"，去掉思考过程，只保留回复部分
        if (text.includes('已思考')) {
          // 找到思考过程结束后的内容
          const parts = text.split('\n\n');
          // 最后一个非空部分通常是回复
          for (let j = parts.length - 1; j >= 0; j--) {
            const part = parts[j].trim();
            if (part.length > 0 && !part.startsWith('已思考')) {
              return part;
            }
          }
        }
        return text;
      }
    }

    // 策略 3: ds-markdown 容器
    const mdBlocks = document.querySelectorAll('[class*="ds-markdown"]');
    for (let i = mdBlocks.length - 1; i >= 0; i--) {
      const text = mdBlocks[i].innerText?.trim();
      if (text && text.length > 10 && !isSidebarText(text)) return text;
    }

    return '';
  });
}

// -----------------------------------------------------------
// 6. analyzeStock — 完整分析流程
// -----------------------------------------------------------
export async function analyzeStock(page, stock, screenshots) {
  // 1. 打开新对话 + 选择视觉模型 + 开启深度思考
  console.log('  打开DeepSeek新对话...');
  await openNewChat(page);

  // 2. 上传截图
  if (screenshots && screenshots.length > 0) {
    console.log(`  上传 ${screenshots.length} 张截图...`);
    await uploadScreenshots(page, screenshots);
    console.log('  ✓ 截图已上传');
  }

  // 3. 拼接提示词
  const prompt = buildPrompt(stock.name);

  // 4. 发送提示词
  console.log('  发送分析请求...');
  await sendPrompt(page, prompt);
  console.log('  ✓ 已发送');

  // 5. 等待回复完成（深度思考模式可能需要较长时间）
  await waitForResponse(page);

  // 6. 提取回复
  const response = await extractResponse(page);

  return response;
}

// -----------------------------------------------------------
// 纯逻辑：拼接提示词（独立导出，便于测试）
// -----------------------------------------------------------
export function buildPrompt(stockName) {
  return `${ANALYSIS_PROMPT}\n\n股票名称：${stockName}`;
}

// -----------------------------------------------------------
// 纯逻辑：回复超时配置（独立导出，便于测试）
// -----------------------------------------------------------
export function getTimeoutConfig() {
  return {
    responseTimeout: DEEPSEEK.responseTimeout,
    pollInterval: DEEPSEEK.pollInterval,
  };
}

// -----------------------------------------------------------
// 纯逻辑：回复提取 fallback 策略列表（独立导出，便于测试）
// -----------------------------------------------------------
export const RESPONSE_SELECTORS = [
  '.ds-markdown--block, .markdown-body, [class*="assistant"], [data-role="assistant"]',
  '[class*="message"], [class*="chat-message"], [class*="msg"]',
];
