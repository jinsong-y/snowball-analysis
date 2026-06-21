// ============================================================
// 浏览器 CDP 连接模块
// ============================================================

import { chromium } from 'playwright';
import { BROWSER } from './config.mjs';

/**
 * 通过 CDP 连接到已启动的 Chrome 浏览器
 * @returns {Promise<{context: BrowserContext, page: Page}>}
 */
export async function connectBrowser() {
  const endpoint = BROWSER.cdpEndpoint;

  try {
    const browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0] || await browser.newContext();
    const page = context.pages()[0] || await context.newPage();
    return { context, page };
  } catch (err) {
    if (err.message.includes('ECONNREFUSED') || err.message.includes('connect')) {
      throw new Error(
        `无法连接到 Chrome (CDP ${endpoint})。\n` +
        '请先运行 ./start-chrome-debug.sh 启动 Chrome 调试模式，然后再重试。'
      );
    }
    throw err;
  }
}
