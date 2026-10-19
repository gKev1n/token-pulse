import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { levelFor, mascotSvg } from './icon'
import { EMPTY, addStep, addTurn, avgTps, deltaText, hitRate, pct, short, sparkline } from './metrics'

const pulse = atom({ plugin: 'token-pulse', key: 'pulse' } as const, EMPTY)
const isHidden = atom({ plugin: 'token-pulse', key: 'isHidden' } as const, false)

/** 状态带宽度低于这个列数时，只显示主要数字 */
const COMPACT_COLUMNS = 96

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'token-pulse',
      description: '显示或隐藏输入框上方的 token-pulse 状态带',
    })
    return next(e)
  })

  on('command.run', { command: 'token-pulse' }, async $ => {
    const hidden = await update($, isHidden, v => !v)
    return { text: hidden ? 'token-pulse 状态带已隐藏。' : 'token-pulse 状态带已显示。' }
  })

  // /clear 之后是新的对话，累计数据清零
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, pulse, () => EMPTY)
    return next(e)
  })

  // 每次模型请求：从收到第一个流片段开始计时，到流结束为止，作为生成耗时。
  // 不从发出请求开始计，是为了把排队和读取上下文（首字延迟）排除在外。
  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    let firstAt: number | null = null
    for await (const chunk of stream) {
      if (firstAt === null) firstAt = await $.clock.now()
      yield chunk
    }
    const result = await stream.result
    // 子代理的请求会和主线程并行，混进来会让"最近一次"失真，只统计主线程
    if (e.agentId === undefined && result.usage) {
      const genMs = firstAt === null ? null : (await $.clock.now()) - firstAt
      const usage = result.usage
      await update($, pulse, p => addStep(p, usage, genMs))
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const { context } = await $.session.usage({})
      await update($, pulse, p => addTurn(p, context))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, pulse)
    if (e.props.hasSurvey || (await read($, isHidden)) || p.ctxPercent === null) {
      return next(e)
    }

    const els = $.ui.resolve(e)
    const { Box, Text } = els
    // 只有终端按列数切换窄屏：桌面应用报告的 bodyColumns 和终端算法不同，
    // 宽屏下也会偏小，按同一阈值判断会把内容误藏掉
    const isCompact = e.surface === 'terminal' && e.props.bodyColumns < COMPACT_COLUMNS
    const level = levelFor(p.ctxPercent)
    const tpsAvg = avgTps(p.samples)
    const cacheAll = hitRate(p.cacheRead, p.inputTotal)
    const delta = deltaText(p.ctxDelta)

    // 终端画不了 SVG，用颜文字；其他界面画 SVG 小人。
    // 只看 'Svg' in els 不够：终端的元素表里也有这个键，所以先按界面判断。
    const icon =
      e.surface !== 'terminal' && 'Svg' in els ? (
        <els.Svg source={mascotSvg(level)} alt={`${level.word} ${level.kaomoji}`} width={25} height={18} />
      ) : (
        <Text color={level.color}>{level.kaomoji}</Text>
      )

    return (
      <Box>
        {icon}
        <Text color={level.color} bold>
          {' '}
          {level.word}
        </Text>
        <Text> </Text>
        <Text>{p.ctxPercent}%</Text>
        {!isCompact && p.ctxTokens !== null && p.ctxWindow !== null && (
          <Text dimColor>
            {'  '}
            {short(p.ctxTokens)}/{short(p.ctxWindow)}
          </Text>
        )}
        {!isCompact && p.history.length > 1 && <Text color={level.color}> {sparkline(p.history)}</Text>}
        {!isCompact && delta !== null && <Text dimColor> {delta}</Text>}

        <Text dimColor>  │  </Text>
        <Text>⇢ </Text>
        <Text>{p.tpsLast === null ? '–' : `${Math.round(p.tpsLast)} tok/s`}</Text>
        {!isCompact && tpsAvg !== null && p.samples.length > 1 && (
          <Text dimColor> · 均 {Math.round(tpsAvg)}</Text>
        )}

        <Text dimColor>  │  </Text>
        <Text>⟳ 缓存命中 </Text>
        <Text color={cacheColor(p.cacheLast)}>{p.cacheLast === null ? '–' : pct(p.cacheLast)}</Text>
        {!isCompact && cacheAll !== null && <Text dimColor> · 累计 {pct(cacheAll)}</Text>}
      </Box>
    )
  })
}

function cacheColor(ratio: number | null): 'success' | 'warning' | 'error' | undefined {
  if (ratio === null) return undefined
  return ratio >= 0.8 ? 'success' : ratio >= 0.5 ? 'warning' : 'error'
}
