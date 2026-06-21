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
// 1. openNewChat — 导航到 DeepSeek 并确保新对话
// -----------------------------------------------------------
export async function openNewChat(page) {
  await page.goto(DEEPSEEK.chatUrl, { waitUntil: 'domcontentloaded' });
  // 等待页面主要交互元素加载（textarea 或 contenteditable）
  await page.waitForSelector('textarea, [contenteditable="true"]', {
    timeout: 30_000,
  });
  // 点击"新对话"按钮（如果存在）
  const newChatBtn = page.locator('text=New chat').or(page.locator('text=新对话'));
  if (await newChatBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await newChatBtn.click();
    await page.waitForTimeout(1_000);
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
  // 优先尝试 textarea，其次 contenteditable
  const textarea = page.locator('textarea');
  const editable = page.locator('[contenteditable="true"]');

  if (await textarea.count() > 0) {
    await textarea.first().fill(prompt);
  } else if (await editable.count() > 0) {
    await editable.first().click();
    await editable.first().evaluate((el, text) => {
      el.textContent = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, prompt);
  } else {
    throw new Error('找不到 DeepSeek 输入框（textarea 或 contenteditable）');
  }

  // 等待 UI 刷新
  await sleep(500);

  // 尝试点击发送按钮
  const sendBtn = page.locator(
    'button[aria-label*="Send"], button[aria-label*="发送"], div[role="button"][aria-label*="Send"], div[role="button"][aria-label*="发送"]'
  );

  if (await sendBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await sendBtn.click();
  } else {
    // fallback: 用键盘快捷键发送
    await page.keyboard.press('Meta+Enter');
  }
}

// -----------------------------------------------------------
// 4. waitForResponse — 轮询等待 AI 回复完成
// -----------------------------------------------------------
export async function waitForResponse(page) {
  const { responseTimeout, pollInterval } = DEEPSEEK;
  const deadline = Date.now() + responseTimeout;

  let stableCount = 0;
  let lastLen = 0;

  while (Date.now() < deadline) {
    await sleep(pollInterval);

    // 检查是否仍在生成（"停止"按钮可见 = 仍在生成）
    const stopBtn = page.locator(
      'button:has-text("Stop"), button:has-text("停止"), div[role="button"]:has-text("Stop"), div[role="button"]:has-text("停止")'
    );
    const isGenerating = await stopBtn.isVisible({ timeout: 500 }).catch(() => false);

    if (isGenerating) {
      stableCount = 0;
      continue;
    }

    // 读取最后一条 assistant 回复的长度
    const text = await extractResponseText(page);
    const currentLen = text.length;

    if (currentLen > 0 && currentLen === lastLen) {
      stableCount++;
      if (stableCount >= 3) {
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
    // 策略 1: DeepSeek 常见的 markdown 容器
    const assistantMessages = document.querySelectorAll(
      '.ds-markdown--block, .markdown-body, [class*="assistant"], [data-role="assistant"]'
    );
    if (assistantMessages.length > 0) {
      return assistantMessages[assistantMessages.length - 1].innerText.trim();
    }

    // 策略 2: 聊天消息列表中最后一条非用户消息
    const allMessages = document.querySelectorAll(
      '[class*="message"], [class*="chat-message"], [class*="msg"]'
    );
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const msg = allMessages[i];
      if (!msg.className.includes('user') && msg.innerText.trim().length > 10) {
        return msg.innerText.trim();
      }
    }

    // 策略 3: 通用 — 获取页面中最后一个较长的文本块
    const blocks = document.querySelectorAll('div, section, article');
    for (let i = blocks.length - 1; i >= 0; i--) {
      const text = blocks[i].innerText?.trim();
      if (text && text.length > 50) {
        return text;
      }
    }

    return '';
  });
}

// -----------------------------------------------------------
// 6. analyzeStock — 完整分析流程
// -----------------------------------------------------------
export async function analyzeStock(page, stock, screenshots) {
  // 1. 打开新对话
  await openNewChat(page);

  // 2. 上传截图
  if (screenshots && screenshots.length > 0) {
    await uploadScreenshots(page, screenshots);
  }

  // 3. 拼接提示词
  const prompt = buildPrompt(stock.name);

  // 4. 发送提示词
  await sendPrompt(page, prompt);

  // 5. 等待回复完成
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
