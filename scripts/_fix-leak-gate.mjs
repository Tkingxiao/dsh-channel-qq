import fs from 'node:fs'
const p = 'src/tools.ts'
let s = fs.readFileSync(p, 'utf8')
const anchor = '  return false\n}'
if (!s.includes(anchor)) { console.error('return false 锚点缺失'); process.exit(1) }
const addition = [
  '  // 2026-11-14 卡点：短舞台指示（（都在聊电竞，本喵继续装睡）喵。）绕过长度闸——',
  "  // 剥掉全部括号段与句尾语气词后几乎不剩内容 = 纯独白泄漏，拦下",
  "  const stripped = t.replace(/[（(][^（）()]*/g, '').replace(/[）)]/g, '').replace(/[喵呢哇嘿呜哈~～。.!！？?、，]/g, '').replace(/\\s/g, '')",
  '  if (t.length >= 6 && stripped.length <= 2) return true',
  '  return false\n}',
].join('\n')
s = s.replace(anchor, addition)
fs.writeFileSync(p, s)
console.log('✓ 闸门已加固')
