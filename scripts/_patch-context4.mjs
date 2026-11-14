import fs from 'node:fs'
const p = 'src/bridge.ts'
let s = fs.readFileSync(p, 'utf8')
const nl = s.includes('\r\n') ? '\r\n' : '\n'

// 1) interface
if (!s.includes('  contextWindow: string[]')) {
  const ifcOld = '  /** Vision attachments waiting to ride with the next turn. */' + nl + '  pendingImages: unknown[]'
  if (!s.includes(ifcOld)) { console.error('interface 锚点缺失'); process.exit(1) }
  s = s.replace(ifcOld, ifcOld + nl + '  /** 滚动群聊上下文（2026-11-14 owner 令）：最近 12 条留底，概率落空的批次不再凭空消失 */' + nl + '  contextWindow: string[]')
  console.log('✓ interface 已加')
} else console.log('interface 已在')

// 2) record 初始化
if (!s.includes('      contextWindow: [],')) {
  const recOld = '      queue: [],' + nl
  const cnt = s.split(recOld).length - 1
  if (cnt < 1) { console.error('record 锚点缺失'); process.exit(1) }
  s = s.replace(recOld, recOld + '      contextWindow: [],' + nl)
  console.log('✓ record 初始化已加（queue: [] 出现', cnt, '处，全部补充——createConversationRecord 只有一处含后续字段，其余为清空点也安全）')
} else console.log('record 初始化已在')

// 3) intake
if (!s.includes('conversation.contextWindow.push(line)')) {
  const intakeOld = '    const line = this.formatLine(event, parsed, called, quoted, voiceText, receivedFiles)' + nl
  if (!s.includes(intakeOld)) { console.error('intake 锚点缺失'); process.exit(1) }
  const intakeNew = intakeOld
    + '    // 滚动上下文窗口（2026-11-14 owner 令）：最近 12 条群聊留底，概率落空的批次不再凭空消失' + nl
    + '    if (line !== null) { conversation.contextWindow.push(line); if (conversation.contextWindow.length > 12) conversation.contextWindow = conversation.contextWindow.slice(-12) }' + nl
  s = s.replace(intakeOld, intakeNew)
  console.log('✓ intake 已挂')
} else console.log('intake 已在')

fs.writeFileSync(p, s)
console.log('✓ 完成')
