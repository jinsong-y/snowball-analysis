#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
function log(msg) { console.log(`[${new Date().toLocaleTimeString('zh-CN')}] ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPostsViaAPI(page, userId, count = 20) {
  // 通过浏览器内fetch调用雪球API（自带cookie）
  const result = await page.evaluate(async ({ userId, count }) => {
    const resp = await fetch(`/v4/statuses/user_timeline.json?user_id=${userId}&page=1&count=${count}`, {
      credentials: 'include'
    });
    const text = await resp.text();
    try { return JSON.parse(text); } catch { return { error: text.substring(0, 500) }; }
  }, { userId, count });
  return result;
}

async function fetchPostsViaScroll(page, userId, count = 20) {
  const userUrl = `https://xueqiu.com/u/${userId}`;
  log(`访问用户主页: ${userUrl}`);
  await page.goto(userUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);

  // 获取用户昵称
  const userName = await page.evaluate(() => {
    const el = document.querySelector('.user-info__name, [class*="username"], [class*="nick"], h1, h2');
    return el?.textContent?.trim() || '未知';
  });

  // 滚动加载
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await sleep(1500);
  }

  // 提取所有帖子的$...$引用和文本
  const posts = await page.evaluate((limit) => {
    const results = [];
    // 找所有帖子容器
    const containers = document.querySelectorAll('.timeline__item, [class*="AnonymousHome_timeline"], [class*="status-content"], article');
    if (containers.length > 0) {
      for (const c of containers) {
        if (results.length >= limit) break;
        results.push(c.textContent?.trim() || '');
      }
    }
    // 备用：提取所有包含$的文本块
    if (results.length === 0) {
      const allText = document.body.innerText;
      const lines = allText.split('\n').filter(l => l.trim().length > 20);
      results.push(...lines.slice(0, limit * 3));
    }
    return results.slice(0, limit);
  }, count);

  // 提取$...$格式的股票引用
  const stockRefs = await page.evaluate(() => {
    const refs = [];
    // 找所有包含股票代码的链接元素
    document.querySelectorAll('a[href*="/S/"]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const match = href.match(/\/S\/([A-Z]{2}\d+)/);
      if (match) {
        refs.push({ code: match[1], name: a.textContent?.trim() || '', href });
      }
    });
    // 也从文本中提取 $名称(代码)$ 格式
    const bodyText = document.body.innerText;
    const dollarMatches = bodyText.match(/\$[^$]+\$/g) || [];
    for (const m of dollarMatches) {
      refs.push({ raw: m.replace(/\$/g, ''), source: 'text' });
    }
    return refs;
  });

  return { userName, userId, posts, stockRefs };
}

async function main() {
  log('启动浏览器...');
  const context = await chromium.launchPersistentContext(path.join(PROJECT_ROOT, '.browser-data'), {
    headless: false, slowMo: 100, viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled'], locale: 'zh-CN',
  });
  const page = await context.newPage();

  try {
    // 获取cookie
    log('访问雪球首页获取cookie...');
    await page.goto('https://xueqiu.com/', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);

    // ========== 用户1: 数字8514487766 ==========
    log('\n========== 获取用户1: 数字8514487766 ==========');
    const user1 = await fetchPostsViaScroll(page, '8514487766', 20);

    // ========== 用户2: 杨爽511 ==========
    log('\n========== 获取用户2: 杨爽511 ==========');
    const user2 = await fetchPostsViaScroll(page, '8141527616', 20);

    // 保存数据
    await fs.mkdir(path.join(PROJECT_ROOT, 'results'), { recursive: true });
    await fs.writeFile(
      path.join(PROJECT_ROOT, 'results', 'both-users-data.json'),
      JSON.stringify({ user1, user2 }, null, 2), 'utf-8'
    );

    // 输出摘要
    console.log('\n===== 用户1: ' + user1.userName + ' =====');
    console.log(`帖子数: ${user1.posts.length}, 股票链接: ${user1.stockRefs.length}`);
    console.log('股票引用:', JSON.stringify(user1.stockRefs, null, 2));

    console.log('\n===== 用户2: ' + user2.userName + ' =====');
    console.log(`帖子数: ${user2.posts.length}, 股票链接: ${user2.stockRefs.length}`);
    console.log('股票引用:', JSON.stringify(user2.stockRefs, null, 2));

    // 输出帖子内容用于手动分析
    console.log('\n\n===== 用户2 帖子内容 =====\n');
    for (let i = 0; i < user2.posts.length; i++) {
      console.log(`--- 帖子 ${i + 1} ---`);
      console.log(user2.posts[i].substring(0, 600));
      console.log('');
    }

    log('数据已保存到 results/both-users-data.json');

  } catch (err) {
    console.error('执行失败:', err);
  } finally {
    await context.close();
  }
}

main();
