// ============================================================
// 状态管理模块 - 批量处理的断点续传支持
// ============================================================

import fs from 'fs/promises';
import path from 'path';
import { PATHS, today } from './config.mjs';

/**
 * 获取状态文件路径
 * @param {string} date - 日期字符串 YYYY-MM-DD
 * @returns {string}
 */
export function getStatePath(date) {
  return path.join(PATHS.projectRoot, `state-${date}.json`);
}

/**
 * 加载状态文件，不存在则初始化
 * @param {string} date - 日期字符串 YYYY-MM-DD
 * @returns {Promise<{date: string, stocks: Record<string, {name: string, status: string, screenshots?: object, resultFile?: string, updatedAt?: string}>}>}
 */
export async function loadState(date) {
  const statePath = getStatePath(date);
  try {
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);
    // 重启时重置: analyzing -> screenshots_done (中断的恢复点)
    for (const code of Object.keys(state.stocks)) {
      if (state.stocks[code].status === 'analyzing') {
        state.stocks[code].status = 'screenshots_done';
        state.stocks[code].updatedAt = new Date().toISOString();
      }
    }
    return state;
  } catch {
    return { date, stocks: {} };
  }
}

/**
 * 保存状态到文件
 * @param {object} state
 * @param {string} date
 */
export async function saveState(state, date) {
  const statePath = getStatePath(date);
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * 更新单只股票的状态
 * @param {object} state - 状态对象
 * @param {string} code - 股票代码
 * @param {string} status - 新状态: pending | screenshots_done | analyzing | done
 * @param {object} [data] - 附加数据
 */
export function updateStockStatus(state, code, status, data = {}) {
  if (!state.stocks[code]) {
    state.stocks[code] = { name: data.name || code, status: 'pending' };
  }
  state.stocks[code].status = status;
  state.stocks[code].updatedAt = new Date().toISOString();
  Object.assign(state.stocks[code], data);
}

/**
 * 获取待处理的股票列表（状态不是 done 的）
 * @param {object} state
 * @returns {Array<{code: string, name: string, status: string}>}
 */
export function getPendingStocks(state) {
  return Object.entries(state.stocks)
    .filter(([, info]) => info.status !== 'done')
    .map(([code, info]) => ({ code, ...info }));
}
