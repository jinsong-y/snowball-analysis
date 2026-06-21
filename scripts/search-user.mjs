#!/usr/bin/env node
// 搜索雪球用户并获取帖子

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

function log(msg) {
  const ts = new Date().toLocaleTimeString('zh-CN');
  console.log(`[${ts}] ${msg}`);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 从用户主页提取帖子内容
async function fetchUserPosts(page, userId, postCount = 20) {
  const userUrl = `https://xueqiu.com/u/${userId}`;
  log(`访问用户主页: ${userUrl}`);
  await page.goto(userUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);

  // 获取用户昵称
  const userName = await page.evaluate(() => {
    const el = document.querySelector('.user-info__name, [class*="username"], [class*="nick"]') ||
               document.querySelector('h1, h2');
    return el?.textContent?.trim() || '未知用户';
  });
  log(`用户昵称: ${userName}`);

  // 滚动加载
  log('滚动加载帖子...');
  let lastCount = 0;
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await sleep(1500);
    const count = await page.evaluate(() =>
      document.querySelectorAll('.timeline__item, [class*="status"], [class*="post"], article, [class*="timeline"] [class*="item"]').length
    );
    if (count >= postCount || count === lastCount) break;
    lastCount = count;
  }

  // 提取帖子文本
  const posts = await page.evaluate((limit) => {
    const selectors = [
      '.timeline__item', '[class*="status"]', '[class*="post"]',
      'article', '[class*="timeline"] [class*="item"]'
    ];
    let items = [];
    for (const sel of selectors) {
      items = document.querySelectorAll(sel);
      if (items.length > 0) break;
    }
    const results = [];
    for (const item of items) {
      if (results.length >= limit) break;
      const text = item.textContent?.trim() || '';
      if (text.length > 0) results.push(text);
    }
    return results;
  }, postCount);

  log(`提取到 ${posts.length} 条帖子`);
  return { userName, userId, posts };
}

// 从帖子中提取股票引用
function extractStocks(posts) {
  const stocks = new Map();
  const addStock = (key, name, source) => {
    if (!stocks.has(key)) stocks.set(key, { key, name, code: '', mentions: 0, sources: [] });
    const s = stocks.get(key);
    s.mentions++;
    if (source && !s.sources.includes(source)) s.sources.push(source.substring(0, 80));
  };

  for (const text of posts) {
    // $股票名$ 格式
    const dollarMatches = text.match(/\$([^$]+)\$/g) || [];
    for (const m of dollarMatches) {
      const inner = m.replace(/\$/g, '').trim();
      // 可能是 "名称(SH600000)" 格式
      const codeMatch = inner.match(/^(.+?)\((SH|SZ|HK|BJ)(\d{6,})\)$/);
      if (codeMatch) {
        const name = codeMatch[1].trim();
        const prefix = codeMatch[2];
        const code = prefix + codeMatch[3];
        addStock(code, name, text);
      } else if (inner.length >= 2 && inner.length <= 10) {
        addStock(inner, inner, text);
      }
    }
  }
  return stocks;
}

async function main() {
  log('启动浏览器...');
  const userDataDir = path.join(PROJECT_ROOT, '.browser-data');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 150,
    viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled'],
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  try {
    // 先访问雪球首页获取cookie
    log('访问雪球首页获取 cookie...');
    await page.goto('https://xueqiu.com/', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);

    // 搜索用户 杨爽511
    log('搜索用户: 杨爽511');
    const searchUrl = 'https://xueqiu.com/k?q=%E6%9D%A8%E7%88%BD511&type=user';
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);

    // 提取搜索结果中的用户链接
    const userLinks = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/u/"]');
      const results = [];
      const seen = new Set();
      for (const link of links) {
        const href = link.getAttribute('href');
        const match = href?.match(/\/u\/(\d+)/);
        if (match && !seen.has(match[1])) {
          seen.add(match[1]);
          results.push({
            userId: match[1],
            name: link.textContent?.trim() || '',
            url: `https://xueqiu.com${href}`
          });
        }
      }
      return results;
    });

    log(`搜索到 ${userLinks.length} 个用户:`);
    for (const u of userLinks) {
      log(`  - ${u.name} (ID: ${u.userId})`);
    }

    // 如果搜索没结果，尝试直接用搜索页面
    if (userLinks.length === 0) {
      log('尝试通过搜索框搜索...');
      await page.goto('https://xueqiu.com/', { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(2000);

      // 找搜索框
      const searchInput = await page.$('input[type="text"], input[placeholder*="搜索"], input[class*="search"], .search-input input');
      if (searchInput) {
        await searchInput.click();
        await searchInput.fill('杨爽511');
        await sleep(1000);
        await page.keyboard.press('Enter');
        await sleep(3000);

        // 切换到用户tab
        const userTab = await page.$('text="用户", [class*="tab"]:has-text("用户")');
        if (userTab) {
          await userTab.click();
          await sleep(2000);
        }

        const moreLinks = await page.evaluate(() => {
          const links = document.querySelectorAll('a[href*="/u/"]');
          const results = [];
          const seen = new Set();
          for (const link of links) {
            const href = link.getAttribute('href');
            const match = href?.match(/\/u\/(\d+)/);
            if (match && !seen.has(match[1])) {
              seen.add(match[1]);
              results.push({
                userId: match[1],
                name: link.textContent?.trim() || '',
                url: `https://xueqiu.com${href}`
              });
            }
          }
          return results;
        });
        if (moreLinks.length > 0) {
          log(`搜索到 ${moreLinks.length} 个用户:`);
          for (const u of moreLinks) {
            log(`  - ${u.name} (ID: ${u.userId})`);
          }
          userLinks.push(...moreLinks);
        }
      }
    }

    if (userLinks.length === 0) {
      log('未找到用户，请手动确认用户ID');
      await context.close();
      return;
    }

    // 选择最匹配的用户（名字包含"杨爽511"）
    let targetUser = userLinks.find(u => u.name.includes('杨爽511') || u.name.includes('杨爽'));
    if (!targetUser) targetUser = userLinks[0];
    log(`选择用户: ${targetUser.name} (ID: ${targetUser.userId})`);

    // 获取该用户的帖子
    const userData = await fetchUserPosts(page, targetUser.userId, 20);

    // 输出帖子内容用于分析
    console.log('\n===== 帖子内容 =====\n');
    for (let i = 0; i < userData.posts.length; i++) {
      console.log(`--- 帖子 ${i + 1} ---`);
      console.log(userData.posts[i].substring(0, 500));
      console.log('');
    }

    // 保存原始数据
    const outputPath = path.join(PROJECT_ROOT, 'results', `user-${targetUser.userId}-raw.json`);
    await fs.mkdir(path.join(PROJECT_ROOT, 'results'), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(userData, null, 2), 'utf-8');
    log(`原始数据已保存到: ${outputPath}`);

  } catch (err) {
    console.error('执行失败:', err);
  } finally {
    log('关闭浏览器...');
    await context.close();
  }
}

main();
