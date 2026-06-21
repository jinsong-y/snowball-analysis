#!/usr/bin/env node
// DeepSeek 页面 DOM 诊断脚本
// 用法: node scripts/diagnose-deepseek.mjs

import { chromium } from 'playwright';
import { DEEPSEEK } from './config.mjs';

async function main() {
  console.log('连接 Chrome...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const page = await context.newPage();

  console.log('打开 DeepSeek...');
  await page.goto(DEEPSEEK.chatUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('textarea', { timeout: 30_000 });
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n========== 1. "开启新对话" 按钮 ==========\n');
  const newChatInfo = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span')];
    const match = spans.find(s => s.textContent?.includes('开启新对话'));
    if (!match) return { found: false };
    return {
      found: true,
      tag: match.tagName,
      text: match.textContent?.trim(),
      class: match.className,
      parent: {
        tag: match.parentElement?.tagName,
        class: match.parentElement?.className,
        role: match.parentElement?.getAttribute('role'),
      },
    };
  });
  console.log(JSON.stringify(newChatInfo, null, 2));

  console.log('\n========== 2. 视觉模型选择器 ==========\n');
  const visionInfo = await page.evaluate(() => {
    const el = document.querySelector('[data-model-type="vision"]');
    if (!el) {
      // 搜索所有 data-model-type
      const all = document.querySelectorAll('[data-model-type]');
      return {
        found: false,
        availableModels: [...all].map(e => ({
          type: e.getAttribute('data-model-type'),
          text: e.textContent?.trim()?.substring(0, 50),
        })),
      };
    }
    return {
      found: true,
      tag: el.tagName,
      text: el.textContent?.trim()?.substring(0, 50),
      class: el.className,
      'data-model-type': el.getAttribute('data-model-type'),
    };
  });
  console.log(JSON.stringify(visionInfo, null, 2));

  console.log('\n========== 3. "深度思考" 按钮 DOM 结构 ==========\n');
  const deepThinkInfo = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span, button, div')];
    const matches = spans.filter(el => el.textContent?.trim()?.includes('深度思考'));
    return matches.map(el => ({
      tag: el.tagName,
      text: el.textContent?.trim()?.substring(0, 30),
      class: el.className?.substring?.(0, 100),
      role: el.getAttribute('role'),
      'aria-pressed': el.getAttribute('aria-pressed'),
      'aria-checked': el.getAttribute('aria-checked'),
      'data-state': el.getAttribute('data-state'),
      tabIndex: el.getAttribute('tabindex'),
      parent: {
        tag: el.parentElement?.tagName,
        class: el.parentElement?.className?.substring?.(0, 80),
        role: el.parentElement?.getAttribute('role'),
        'aria-pressed': el.parentElement?.getAttribute('aria-pressed'),
      },
      // 检查兄弟元素
      siblings: [...(el.parentElement?.children || [])].map(c => ({
        tag: c.tagName,
        text: c.textContent?.trim()?.substring(0, 20),
        class: c.className?.substring?.(0, 50),
      })),
    }));
  });
  console.log(JSON.stringify(deepThinkInfo, null, 2));

  console.log('\n========== 4. 输入框结构 ==========\n');
  const inputInfo = await page.evaluate(() => {
    const textareas = document.querySelectorAll('textarea');
    const editables = document.querySelectorAll('[contenteditable="true"]');
    return {
      textareas: [...textareas].map(t => ({
        placeholder: t.placeholder,
        class: t.className?.substring?.(0, 80),
        rows: t.rows,
      })),
      editables: [...editables].map(e => ({
        tag: e.tagName,
        class: e.className?.substring?.(0, 80),
        role: e.getAttribute('role'),
      })),
    };
  });
  console.log(JSON.stringify(inputInfo, null, 2));

  console.log('\n========== 5. 发送按钮结构 ==========\n');
  // 先输入一些文字让发送按钮出现
  const textarea = page.locator('textarea').first();
  if (await textarea.count() > 0) {
    await textarea.click();
    await page.keyboard.type('test', { delay: 50 });
    await new Promise(r => setTimeout(r, 1000));
  }

  const sendBtnInfo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, div[role="button"]')];
    // 找靠近 textarea 的按钮
    const textarea = document.querySelector('textarea');
    const textareaRect = textarea?.getBoundingClientRect();

    return btns
      .filter(btn => {
        const rect = btn.getBoundingClientRect();
        // 按钮在 textarea 下方 100px 以内
        return textareaRect &&
          rect.top >= textareaRect.bottom - 10 &&
          rect.top <= textareaRect.bottom + 100;
      })
      .map(btn => ({
        tag: btn.tagName,
        text: btn.textContent?.trim()?.substring(0, 30),
        class: btn.className?.substring?.(0, 80),
        'aria-label': btn.getAttribute('aria-label'),
        role: btn.getAttribute('role'),
        disabled: btn.disabled,
        hasSvg: btn.querySelector('svg') !== null,
        svgPaths: [...btn.querySelectorAll('svg path')].map(p => p.getAttribute('d')?.substring(0, 30)),
        rect: {
          x: Math.round(btn.getBoundingClientRect().x),
          y: Math.round(btn.getBoundingClientRect().y),
          w: Math.round(btn.getBoundingClientRect().width),
          h: Math.round(btn.getBoundingClientRect().height),
        },
      }));
  });
  console.log(JSON.stringify(sendBtnInfo, null, 2));

  console.log('\n========== 6. 所有含 SVG 的按钮 ==========\n');
  const svgBtns = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button:has(svg)')];
    return btns.map(btn => ({
      text: btn.textContent?.trim()?.substring(0, 20),
      'aria-label': btn.getAttribute('aria-label'),
      class: btn.className?.substring?.(0, 60),
      rect: {
        x: Math.round(btn.getBoundingClientRect().x),
        y: Math.round(btn.getBoundingClientRect().y),
      },
    }));
  });
  console.log(JSON.stringify(svgBtns, null, 2));

  console.log('\n========== 诊断完成 ==========');
  await page.close();
  await browser.close();
}

main().catch(err => {
  console.error('诊断失败:', err.message);
  process.exit(1);
});
