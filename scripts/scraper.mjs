// ============================================================
// 雪球热股列表抓取模块
// ============================================================

import { XUEQIU } from './config.mjs';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 从雪球热股页面抓取前 N 只股票
 * @param {import('playwright').Page} page - Playwright Page 对象
 * @returns {Promise<Array<{code: string, name: string, url: string}>>}
 */
export async function scrapeHotStocks(page) {
  await page.goto(XUEQIU.hotUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  await sleep(3000);

  // 等待页面加载完成，提取所有包含 /S/ 链接的股票数据
  let stocks = await page.evaluate(() => {
    const results = [];

    // 方法1: 从表格行提取
    const rows = document.querySelectorAll('table tbody tr, [class*="table"] tr, [class*="row"]');
    for (const row of rows) {
      const link = row.querySelector('a[href*="/S/"]');
      if (link) {
        const href = link.getAttribute('href');
        const code = href.match(/\/S\/([A-Z]{2}\d+)/)?.[1];
        const nameEl = row.querySelector('[class*="name"], td:nth-child(2), .stock-name');
        const name = nameEl?.textContent?.trim() || link.textContent?.trim() || '';
        if (code && name) {
          results.push({ code, name, url: `https://xueqiu.com${href}` });
        }
      }
    }

    // 方法2: 从所有链接提取（表格方法失败时）
    if (results.length === 0) {
      const links = document.querySelectorAll('a[href*="/S/"]');
      const seen = new Set();
      for (const link of links) {
        const href = link.getAttribute('href');
        const code = href.match(/\/S\/([A-Z]{2}\d+)/)?.[1];
        if (code && !seen.has(code)) {
          seen.add(code);
          const name = link.textContent?.trim() || '';
          results.push({ code, name, url: `https://xueqiu.com${href}` });
        }
      }
    }

    return results;
  });

  // 滚动加载更多（雪球可能懒加载）
  if (stocks.length < XUEQIU.topN) {
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await sleep(1500);

      const more = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/S/"]');
        const results = [];
        const seen = new Set();
        for (const link of links) {
          const href = link.getAttribute('href');
          const code = href.match(/\/S\/([A-Z]{2}\d+)/)?.[1];
          if (code && !seen.has(code)) {
            seen.add(code);
            results.push({ code, name: link.textContent?.trim() || '', url: `https://xueqiu.com${href}` });
          }
        }
        return results;
      });

      stocks = more;
      if (stocks.length >= XUEQIU.topN) break;
    }
  }

  // 去重并取前 N
  const seen = new Set();
  stocks = stocks.filter(s => {
    if (seen.has(s.code)) return false;
    seen.add(s.code);
    return true;
  }).slice(0, XUEQIU.topN);

  return stocks;
}
