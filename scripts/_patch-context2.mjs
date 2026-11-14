import fs from 'node:fs'
const p = 'src/bridge.ts'
let s = fs.readFileSync(p, 'utf8')
const nl = s.includes('\r\n') ? '\r\n' : '\n'

// 1) Conversation 接口加 contextWindow
if (!s.includes('  contextWindow: string[]')) {
  const ifcOld = '  queue: string[]' + nl
  if (!s.includes(ifcOld)) { console.error('interface 锚点缺失'); process.exit(1) }
  s = s.replace(ifcOld, ifcOld + '  /** 滚动群聊上下文（2026-11-14 owner 令）：最近 12 条留底，概率落空的批次不再凭空消失 */' + nl + '  contextWindow: string[]' + nl)
  console.log('✓ interface 已加')
} else console.log('interface 已在')

// 2) createConversationRecord 初始化
if (!s.includes('      contextWindow: [],')) {
  const recOld = '      queue: [],' + nl
  if (!s.includes(recOld)) { console.error('record 锚点缺失'); process.exit(1) }
  s = s.replace(recOld, recOld + '      contextWindow: [],' + nl)
  console.log('✓ record 初始化已加')
} else console.log('record 初始化已在')

// 3) 群聊 intake：格式化行进滚动窗口（4 空格缩进）
if (!s.includes('      if (line !== null) { conversation.contextWindow.push(line);')) {
  const intakeOld = '    const line = this.formatLine(event, parsed, called, quoted, voiceText, receivedFiles)' + nl
  if (!s.includes(intakeOld)) { console.error('intake 锚点缺失'); process.exit(1) }
  const intakeNew = intakeOld
    + '    // 滚动上下文窗口（2026-11-14 owner 令）：最近 12 条群聊留底，概率落空的批次不再凭空消失' + nl
    + '    if (line !== null) { conversation.contextWindow.push(line); if (conversation.contextWindow.length > 12) conversation.contextWindow = conversation.contextWindow.slice(-12) }' + nl
  s = s.replace(intakeOld, intakeNew)
  console.log('✓ intake 已挂')
} else console.log('intake 已在')

// 4) flushNow：背景块（排除本批次已带的行）
if (!s.includes('      const priorContext = conversation.contextWindow')) {
  const flushOld = "    const context = conversation.queue.join('" + "'" + ')' + nl
  if (!s.includes(flushOld)) { console.error('flush context 锚点缺失'); process.exit(1) }
  const flushNew = [
    '      const queuedSet = new Set(conversation.queue)',
    '      const priorContext = conversation.contextWindow.filter((l) => !queuedSet.has(l)).slice(-12)',
    "      const context = conversation.queue.join('",
    "')",
  ].join(nl)
  s = s.replace(flushOld, flushNew)
  console.log('✓ flush 背景块已加')
} else console.log('flush 背景块已在')

// 5) prompt 插背景块（六维暗示之后）
if (!s.includes('【更早的群聊上下文')) {
  const hintAnchor = "      + (sixDimHint !== ''" + " ? `" + nl + '（六维情感行为暗示：${sixDimHint}）` : \'\')' + nl
  if (!s.includes(hintAnchor)) { console.error('hint 锚点缺失'); process.exit(1) }
  const hintNew = hintAnchor
    + '      + (priorContext.length > 0 ? `' + nl + '【更早的群聊上下文（背景参考，联系用，不必逐条回应）】：' + nl + '${priorContext.join(' + "'" + nl + "'" + ')}` : \'\')' + nl
  s = s.replace(hintAnchor, hintNew)
  console.log('✓ prompt 背景块已加')
} else console.log('prompt 背景块已在')

fs.writeFileSync(p, s)
console.log('✓ 全部完成')
