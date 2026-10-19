import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, TurnUsage } from 'claude-code'

import { LEVELS, levelFor, mascotSvg } from '../hooks/icon'
import { EMPTY, addStep, addTurn, avgTps, deltaText, short, sparkline } from '../hooks/metrics'

const usage = (o: Partial<TurnUsage> = {}): TurnUsage => ({
  model: 'claude-test',
  input_tokens: 100,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 900,
  output_tokens: 500,
  ...o,
})

const BAND = (bodyColumns: number) =>
  ({
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  }) as const

describe('计算', () => {
  test('缓存命中率 = 缓存读取 ÷ 全部输入，并按会话累计', () => {
    let p = addStep(EMPTY, usage(), 2000)
    expect(p.cacheLast).toBe(0.9)
    p = addStep(p, usage({ input_tokens: 500, cache_creation_input_tokens: 500, cache_read_input_tokens: 0 }), 2000)
    expect(p.cacheLast).toBe(0)
    expect(p.cacheRead).toBe(900)
    expect(p.inputTotal).toBe(2000)
  })

  test('输出速度 = 输出 token ÷ 生成耗时；过短的请求不计入', () => {
    let p = addStep(EMPTY, usage({ output_tokens: 500 }), 5000)
    expect(p.tpsLast).toBe(100)
    p = addStep(p, usage({ output_tokens: 5 }), 100)
    expect(p.tpsLast).toBe(100)
    expect(p.samples.length).toBe(1)
    p = addStep(p, usage({ output_tokens: 300 }), 5000)
    // 平均按 token 加权：800 / 10s = 80
    expect(avgTps(p.samples)).toBe(80)
  })

  test('趋势图把 0–100 映射到 8 级方块', () => {
    expect(sparkline([0, 50, 100])).toBe('▁▅█')
  })

  test('上下文变化量按轮计算，首轮没有变化量', () => {
    let p = addTurn(EMPTY, { tokens: 36000, window: 200000, percent: 18 })
    expect(p.ctxDelta).toBeNull()
    p = addTurn(p, { tokens: 134400, window: 200000, percent: 67 })
    expect(p.ctxDelta).toBe(98400)
    expect(deltaText(p.ctxDelta)).toBe('▲ +98.4k')
    expect(deltaText(-40000)).toBe('▼ 40k')
    expect(short(200000)).toBe('200k')
    expect(short(1000000)).toBe('1M')
  })

  test('精力值按上下文占用分五档', () => {
    expect([0, 24, 25, 50, 74, 75, 89, 90, 100].map(n => levelFor(n).word)).toEqual([
      'Fresh', 'Fresh', 'Focused', 'Tired', 'Tired', 'Drained', 'Drained', 'Exhausted', 'Exhausted',
    ])
    for (const l of LEVELS) expect(mascotSvg(l)).toContain('<svg')
  })
})

/** 引擎读到的上下文用量 */
function usageAt(on: On, context: { tokens: number; window: number; percent: number }) {
  on('session.usage', () => ({ value: { startedAt: 0, context, rateLimits: [] } }))
}

/** 插件把状态带交回给引擎时（next(e)），由引擎自己画一个空白 */
function engineDraws(on: On) {
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
}

/** 在测试的最底层模拟一次模型请求：先吐一个片段，过 genMs 毫秒后结束 */
function model(on: On, clock: ReturnType<typeof mock.clock>, genMs: number, u: TurnUsage) {
  on('turn.step', async function* (_$, e) {
    yield { kind: 'text', index: 0, text: '你好' } as const
    await clock.sleep(genMs)
    return { turnId: e.turnId, index: e.index, answer: '你好', toolUses: [], stopReason: 'end_turn', usage: u }
  })
}

async function runStep($: Engine, clock: ReturnType<typeof mock.clock>, genMs: number, agentId?: string) {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-test', messageCount: 1, ...(agentId ? { agentId } : {}) })
  const done = (async () => {
    for await (const _ of stream) {
      // 读完整个流
    }
    return stream.result
  })()
  await clock.settle()
  await clock.advance(genMs)
  return done
}

describe('状态带', () => {
  test('一次请求后显示上下文、速度和缓存命中率', async ($, on) => {
    const clock = mock.clock(on, { now: 1000 })
    model(on, clock, 4000, usage({ output_tokens: 400 }))
    usageAt(on, { tokens: 42000, window: 100000, percent: 42 })
    on('turn.complete', () => ({ text: '' }))
    engineDraws(on)

    await runStep($, clock, 4000)
    await $.turn.complete({ answer: '你好', durationMs: 4000, isAborted: false, turnId: 't1', reason: 'answer' })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'token-pulse', surface, ...BAND(120) })
      expect(await ui.find({ type: 'Text', text: '42%' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '100 tok/s' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '90%' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'Focused' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '42k/100k' })).toBeDefined()
      await ui.unmount()
    }

    // 终端用颜文字，桌面画 SVG 小人
    const term = await $.ui.mount({ plugin: 'token-pulse', surface: 'terminal', ...BAND(120) })
    expect(await term.find({ type: 'Text', text: '(•_•)' })).toBeDefined()
    await term.unmount()
    const desk = await $.ui.mount({ plugin: 'token-pulse', surface: 'desktop', ...BAND(120) })
    expect(await desk.find({ type: 'Svg' })).toBeDefined()
    await desk.unmount()

    // 窄屏只留主要数字
    const narrow = await $.ui.mount({ plugin: 'token-pulse', surface: 'terminal', ...BAND(50) })
    expect(await narrow.find({ type: 'Text', text: '42%' })).toBeDefined()
    expect(await narrow.find({ type: 'Text', text: '累计' })).toBeUndefined()
    await narrow.unmount()

    // 桌面应用不按列数切窄屏，列数小也显示完整内容
    const deskNarrow = await $.ui.mount({ plugin: 'token-pulse', surface: 'desktop', ...BAND(50) })
    expect(await deskNarrow.find({ type: 'Text', text: '累计' })).toBeDefined()
    expect(await deskNarrow.find({ type: 'Text', text: '42k/100k' })).toBeDefined()
    await deskNarrow.unmount()
  })

  test('子代理的请求不计入', async ($, on) => {
    const clock = mock.clock(on)
    model(on, clock, 1000, usage())
    usageAt(on, { tokens: 10, window: 100, percent: 10 })
    on('turn.complete', () => ({ text: '' }))
    engineDraws(on)

    await runStep($, clock, 1000, 'agent-1')
    await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })

    const ui = await $.ui.mount({ plugin: 'token-pulse', surface: 'terminal', ...BAND(120) })
    expect(await ui.find({ type: 'Text', text: 'tok/s' })).toBeUndefined()
    await ui.unmount()
  })

  test('首次响应前不显示；/token-pulse 可以隐藏', async ($, on) => {
    const clock = mock.clock(on)
    model(on, clock, 2000, usage())
    usageAt(on, { tokens: 10, window: 100, percent: 10 })
    on('turn.complete', () => ({ text: '' }))
    engineDraws(on)

    let ui = await $.ui.mount({ plugin: 'token-pulse', surface: 'terminal', ...BAND(120) })
    expect(await ui.find({ type: 'Text', text: '上下文' })).toBeUndefined()
    await ui.unmount()

    await runStep($, clock, 2000)
    await $.turn.complete({ answer: '', durationMs: 2000, isAborted: false, turnId: 't1', reason: 'answer' })
    await $.command.run({ command: 'token-pulse', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

    ui = await $.ui.mount({ plugin: 'token-pulse', surface: 'terminal', ...BAND(120) })
    expect(await ui.find({ type: 'Text', text: '上下文' })).toBeUndefined()
    await ui.unmount()
  })
})
