// ============================================================
// 单只股票K线截图模块
// ============================================================

import fs from 'fs/promises';
import path from 'path';
import { PATHS, XUEQIU, today } from './config.mjs';

/**
 * 等待指定毫秒
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 构建截图文件名
 * @param {string} date - 日期 YYYY-MM-DD
 * @param {{code: string, name: string}} stock
 * @param {number} index - 序号（从0开始）
 * @param {string} period - 周期标签，如 '日K' 或 '周K'
 * @returns {string} 文件名
 */
export function buildFilename(date, stock, index, period) {
  const safeName = stock.name.replace(/[/\\:*?"<>|]/g, '_');
  const seq = String(index + 1).padStart(2, '0');
  return `${date}_${seq}_${stock.code}_${safeName}_${period}.png`;
}

/**
 * 构建截图结果对象（返回绝对路径）
 * @param {string} dir - 截图目录
 * @param {string} date - 日期 YYYY-MM-DD
 * @param {{code: string, name: string}} stock
 * @param {number} index - 序号
 * @returns {{dayScreenshot: string, weekScreenshot: string}}
 */
export function buildResult(dir, date, stock, index) {
  return {
    dayScreenshot: path.join(dir, buildFilename(date, stock, index, '日K')),
    weekScreenshot: path.join(dir, buildFilename(date, stock, index, '周K')),
  };
}

/**
 * 确保截图目录存在，不存在则递归创建
 * @param {string} dir - 目录路径
 */
export async function ensureScreenshotDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * 对单只股票进行日K和周K截图
 * @param {import('playwright').Page} page - Playwright Page 对象
 * @param {{code: string, name: string, url: string}} stock - 股票信息
 * @param {number} index - 序号（从0开始）
 * @param {string} [date] - 日期字符串，默认今天
 * @returns {Promise<{dayScreenshot: string, weekScreenshot: string}>}
 */
export async function screenshotStock(page, stock, index, date) {
  const screenshotDir = PATHS.screenshots;
  const resolvedDate = date || today();

  // 确保截图目录存在
  await ensureScreenshotDir(screenshotDir);

  const result = buildResult(screenshotDir, resolvedDate, stock, index);

  console.log(`[${index + 1}] 正在截图: ${stock.name} (${stock.code})`);

  // --- 导航到股票页面 ---
  try {
    console.log(`  打开: ${stock.url}`);
    await page.goto(stock.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await sleep(5000);  // 等待图表渲染
  } catch (err) {
    console.log(`  页面加载超时，尝试继续: ${err.message}`);
    await sleep(3000);
  }

  // --- 日K截图 ---
  try {
    // 确认在日K视图（默认），尝试点击日K按钮
    const dayBtn = await page.$('[data-period="day"], [class*="day"]');
    if (dayBtn) {
      await dayBtn.click();
      await sleep(4000);
    }

    // 尝试滚动到顶部确保K线图可见
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1000);

    await page.screenshot({ path: result.dayScreenshot, fullPage: false });
    console.log(`  日K截图已保存: ${result.dayScreenshot}`);
  } catch (err) {
    console.log(`  日K截图失败: ${err.message}`);
  }

  // --- 周K截图 ---
  try {
    // 通过 data-period 属性点击周K按钮
    const weekBtn = await page.$('[data-period="week"], [data-period="2week"]');
    if (weekBtn) {
      await weekBtn.click();
      await sleep(5000);
    } else {
      // 备选：尝试文本匹配
      const weekBtnByText = await page.$('text="周K"');
      if (weekBtnByText) {
        await weekBtnByText.click();
        await sleep(5000);
      } else {
        console.log('  未找到周K按钮，尝试通过URL切换...');
        const weekUrl = stock.url + (stock.url.includes('?') ? '&' : '?') + 'period=week';
        await page.goto(weekUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await sleep(5000);
      }
    }

    await page.screenshot({ path: result.weekScreenshot, fullPage: false });
    console.log(`  周K截图已保存: ${result.weekScreenshot}`);
  } catch (err) {
    console.log(`  周K截图失败: ${err.message}`);
  }

  return result;
}
