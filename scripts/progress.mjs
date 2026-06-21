// ============================================================
// 进度跟踪与 ETA 预估模块
// ============================================================

/**
 * 格式化持续时间为人类可读格式
 * @param {number} ms - 毫秒
 * @returns {string}
 */
export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}m${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

/**
 * 创建进度跟踪器
 * @param {number} total - 总数
 * @returns {{tick: function, summary: function, getETA: function}}
 */
export function createProgressTracker(total) {
  const startTime = Date.now();
  let completed = 0;
  let displayIndex = 0;
  // 记录最近完成的时间戳，用于滚动平均
  const recentCompletions = []; // {timestamp, duration}[]

  /**
   * 更新进度
   * @param {string} stock - 股票名称
   * @param {string} code - 股票代码
   * @param {string} status - 状态描述
   * @param {number} [duration] - 该只股票处理耗时(ms)
   */
  function tick(stock, code, status, duration) {
    const now = new Date();
    const ts = now.toLocaleTimeString('zh-CN');

    if (status === 'done' || status === 'error') {
      completed++;
      displayIndex = completed;
      if (duration) {
        recentCompletions.push({ timestamp: Date.now(), duration });
        if (recentCompletions.length > 5) {
          recentCompletions.shift();
        }
      }
    } else {
      // 中间状态用当前处理的序号
      displayIndex = completed + 1;
    }

    const statusIcon = status === 'done' ? '✓' : status === 'error' ? '✗' : '...';
    console.log(`[${ts}] [${displayIndex}/${total}] ${stock} (${code}) — ${statusIcon} ${status}`);
  }

  /**
   * 基于最近5只的滚动平均计算每只平均耗时(ms)
   * @returns {number}
   */
  function getAverageDuration() {
    if (recentCompletions.length === 0) {
      // 没有历史数据，用已用时间/已完成数量
      if (completed === 0) return 0;
      return (Date.now() - startTime) / completed;
    }
    const sum = recentCompletions.reduce((acc, c) => acc + c.duration, 0);
    return sum / recentCompletions.length;
  }

  /**
   * 计算 ETA
   * @returns {{remaining: number, avgDuration: number}}
   */
  function getETA() {
    const avgDuration = getAverageDuration();
    const remaining = Math.max(0, total - completed);
    const estimatedRemainingMs = avgDuration * remaining;
    return { remaining, avgDuration, estimatedRemainingMs };
  }

  /**
   * 打印进度汇总
   */
  function summary() {
    const elapsed = Date.now() - startTime;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const { estimatedRemainingMs, avgDuration } = getETA();

    const elapsedStr = formatDuration(elapsed);
    const etaStr = completed > 0 ? formatDuration(estimatedRemainingMs) : '--';
    const speedStr = completed > 0 ? `${formatDuration(avgDuration)}/只` : '--';

    console.log(`进度: ${completed}/${total} (${percent}%) | 已用时: ${elapsedStr} | 预计剩余: ${etaStr} | 速度: ${speedStr}`);
  }

  return { tick, summary, getETA, getAverageDuration };
}
