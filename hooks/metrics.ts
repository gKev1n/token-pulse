import type { ModelUsage } from 'claude-code'

import type { Pulse, Sample } from '../types'

/** 趋势图保留的轮数 */
export const HISTORY_LEN = 12
/** 平均速度取最近多少次有效采样 */
export const SAMPLE_LEN = 10
/** 生成太短的请求（只调了个工具、只回一两个字）测出来的速度噪声很大，不计入 */
export const MIN_TOKENS = 20
export const MIN_MS = 300

export const EMPTY: Pulse = {
  ctxPercent: null,
  ctxTokens: null,
  ctxWindow: null,
  ctxDelta: null,
  history: [],
  tpsLast: null,
  samples: [],
  cacheLast: null,
  cacheRead: 0,
  inputTotal: 0,
}

/** 一次请求的全部输入 token：未缓存 + 缓存写入 + 缓存读取 */
export function inputOf(u: ModelUsage): number {
  return u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens
}

/** 缓存命中率 = 缓存读取 ÷ 全部输入；没有输入时返回 null */
export function hitRate(read: number, total: number): number | null {
  return total > 0 ? read / total : null
}

/** 平均速度按 token 加权（总 token ÷ 总耗时），避免短请求把平均值拉偏 */
export function avgTps(samples: readonly Sample[]): number | null {
  let tokens = 0
  let ms = 0
  for (const s of samples) {
    tokens += s.tokens
    ms += s.ms
  }
  return ms > 0 ? (tokens * 1000) / ms : null
}

/** 把一次请求的 usage 和生成耗时并入状态 */
export function addStep(p: Pulse, usage: ModelUsage, genMs: number | null): Pulse {
  const total = inputOf(usage)
  const next: Pulse = {
    ...p,
    cacheLast: hitRate(usage.cache_read_input_tokens, total) ?? p.cacheLast,
    cacheRead: p.cacheRead + usage.cache_read_input_tokens,
    inputTotal: p.inputTotal + total,
  }
  if (genMs !== null && usage.output_tokens >= MIN_TOKENS && genMs >= MIN_MS) {
    const sample = { tokens: usage.output_tokens, ms: genMs }
    next.tpsLast = (sample.tokens * 1000) / sample.ms
    next.samples = [...p.samples, sample].slice(-SAMPLE_LEN)
  }
  return next
}

/** 一轮结束时记下上下文占用，追加到趋势 */
export function addTurn(p: Pulse, ctx: { tokens?: number; window: number; percent?: number }): Pulse {
  if (ctx.percent === undefined || ctx.tokens === undefined) return p
  return {
    ...p,
    ctxPercent: ctx.percent,
    ctxTokens: ctx.tokens,
    ctxWindow: ctx.window,
    ctxDelta: p.ctxTokens === null ? null : ctx.tokens - p.ctxTokens,
    history: [...p.history, ctx.percent].slice(-HISTORY_LEN),
  }
}

/** 134400 → 134.4k，200000 → 200k */
export function short(n: number): string {
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
  if (Math.abs(n) >= 1_000_000) return `${fmt(Math.round(n / 100_000) / 10)}M`
  if (Math.abs(n) >= 1_000) return `${fmt(Math.round(n / 100) / 10)}k`
  return String(n)
}

/** ▲ +98.3k / ▼ 40k / 持平时返回 null */
export function deltaText(delta: number | null): string | null {
  if (delta === null || delta === 0) return null
  return delta > 0 ? `▲ +${short(delta)}` : `▼ ${short(-delta)}`
}

const BARS = '▁▂▃▄▅▆▇█'

/** 0–100 的百分比画成一行方块字符，不依赖终端的图形能力，各个界面都能显示 */
export function sparkline(values: readonly number[]): string {
  return values
    .map(v => BARS[Math.min(BARS.length - 1, Math.max(0, Math.floor((v / 100) * BARS.length)))])
    .join('')
}

export function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}
