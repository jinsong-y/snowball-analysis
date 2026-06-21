#!/usr/bin/env node
// 诊断 DeepSeek 回复的实际 DOM 结构
import { chromium } from 'playwright';
import { DEEPSEEK } from './config.mjs';

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();

  await page.goto(DEEPSEEK.chatUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('textarea', { timeout: 30_000 });
  await new Promise(r => setTimeout(r, 2000));

  // 发送一个简单测试消息
  const textarea = page.locator('textarea').first();
  await textarea.click();
  await page.keyboard.type('请回复"测试成功"两个字', { delay: 10 });
  await new Promise(r => setTimeout(r, 500));

  // 点击发送
  const sendBtn = page.locator('div[role="button"].ds-button--primary');
  if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sendBtn.click();
    console.log('已发送测试消息');
  }

  // 等待回复
  console.log('等待回复...');
  await new Promise(r => setTimeout(r, 15000));

  // 分析回复区域的 DOM
  console.log('\n========== 回复区域 DOM 分析 ==========\n');

  const analysis = await page.evaluate(() => {
    const result = {};

    // 1. 所有 ds-markdown 相关元素
    const mdBlocks = document.querySelectorAll('[class*="ds-markdown"]');
    result.markdownBlocks = [...mdBlocks].map((el, i) => ({
      index: i,
      class: el.className?.substring?.(0, 100),
      text: el.innerText?.trim()?.substring(0, 200),
      textLen: el.innerText?.trim()?.length || 0,
      childCount: el.children.length,
    }));

    // 2. 所有 role="article" 或 role="log" 的元素
    const articles = document.querySelectorAll('[role="article"], [role="log"], [role="listitem"]');
    result.articles = [...articles].map(el => ({
      role: el.getAttribute('role'),
      class: el.className?.substring?.(0, 80),
      text: el.innerText?.trim()?.substring(0, 200),
    }));

    // 3. 查找包含 "测试" 的文本节点
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const testNodes = [];
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.includes('测试')) {
        const parent = walker.currentNode.parentElement;
        testNodes.push({
          text: walker.currentNode.textContent.substring(0, 100),
          parentTag: parent?.tagName,
          parentClass: parent?.className?.substring?.(0, 80),
          grandparentClass: parent?.parentElement?.className?.substring?.(0, 80),
        });
      }
    }
    result.testTextNodes = testNodes;

    // 4. 查找所有 class 包含 "message" 的元素
    const msgs = document.querySelectorAll('[class*="message"]');
    result.messages = [...msgs].slice(-5).map(el => ({
      class: el.className?.substring?.(0, 80),
      text: el.innerText?.trim()?.substring(0, 100),
    }));

    // 5. 查找 textarea 附近的按钮（发送区域）
    const textarea = document.querySelector('textarea');
    const textareaParent = textarea?.parentElement;
    result.textareaArea = {
      parentClass: textareaParent?.className?.substring?.(0, 80),
      parentParentClass: textareaParent?.parentElement?.className?.substring?.(0, 80),
      siblingCount: textareaParent?.children?.length,
    };

    return result;
  });

  console.log(JSON.stringify(analysis, null, 2));

  await page.close();
  // 不关闭浏览器，保持 Chrome 运行
  browser.close();
}

main().catch(err => {
  console.error('诊断失败:', err.message);
  process.exit(1);
});
