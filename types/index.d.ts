/** 一次输出速度采样：本次请求生成的 token 数与生成耗时（毫秒） */
export type Sample = { tokens: number; ms: number }

/** 状态带读取的全部数据，会话内由 host 保存，热重载后不丢失 */
export type Pulse = {
  /** 上下文窗口占用百分比（0–100），首次响应前为 null */
  ctxPercent: number | null
  /** 上下文已用 token 数 */
  ctxTokens: number | null
  /** 上下文窗口大小 */
  ctxWindow: number | null
  /** 与上一轮相比上下文增减的 token 数；首轮为 null */
  ctxDelta: number | null
  /** 最近若干轮结束时的上下文占用百分比，最多 12 个 */
  history: number[]
  /** 最近一次请求的输出速度（tok/s） */
  tpsLast: number | null
  /** 最近若干次有效采样，用于算平均速度 */
  samples: Sample[]
  /** 最近一次请求的缓存命中率（0–1） */
  cacheLast: number | null
  /** 本会话累计：缓存读取的输入 token */
  cacheRead: number
  /** 本会话累计：全部输入 token（未缓存 + 缓存写入 + 缓存读取） */
  inputTotal: number
}

declare module 'claude-code' {
  interface PluginState {
    'token-pulse': { pulse: Pulse; isHidden: boolean }
  }
}
