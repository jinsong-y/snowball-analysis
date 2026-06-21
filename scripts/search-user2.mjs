#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
function log(msg) { console.log(`[${new Date().toLocaleTimeString('zh-CN')}] ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  log('启动浏览器...');
  const context = await chromium.launchPersistentContext(path.join(PROJECT_ROOT, '.browser-data'), {
    headless: false, slowMo: 150, viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled'], locale: 'zh-CN',
  });
  const page = await context.newPage();

  try {
    // 获取cookie
    log('访问雪球首页...');
    await page.goto('https://xueqiu.com/', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);

    // 使用雪球搜索API
    log('通过API搜索用户: 杨爽511');
    const searchResult = await page.evaluate(async () => {
      const resp = await fetch('https://xueqiu.com/query/v1/search/user.json?q=%E6%9D%A8%E7%88%BD511&count=10&page=1', {
        credentials: 'include'
      });
      return resp.json();
    });
    console.log('API搜索结果:', JSON.stringify(searchResult, null, 2));

    // 也尝试搜索网页版
    log('访问搜索页面...');
    await page.goto('https://xueqiu.com/k?q=%E6%9D%A8%E7%88%BD511', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);

    // 截图查看页面状态
    await page.screenshot({ path: path.join(PROJECT_ROOT, 'results', 'search-result.png'), fullPage: false });
    log('搜索页面截图已保存');

    // 提取页面上所有链接
    const allLinks = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a').forEach(a => {
        const href = a.href;
        const text = a.textContent?.trim();
        if (text && text.length > 0 && text.length < 50) {
          links.push({ href, text });
        }
      });
      return links;
    });

    // 过滤可能的用户链接
    const userLinks = allLinks.filter(l => l.href.includes('/u/') || l.text.includes('杨爽'));
    console.log('\n可能的用户链接:');
    for (const l of userLinks.slice(0, 20)) {
      console.log(`  ${l.text} -> ${l.href}`);
    }

    // 提取页面文本内容
    const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 3000) || '');
    console.log('\n页面文本(前3000字):\n', pageText);

  } catch (err) {
    console.error('执行失败:', err);
  } finally {
    await context.close();
  }
}

main();
