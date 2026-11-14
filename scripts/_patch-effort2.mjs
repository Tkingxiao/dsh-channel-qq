import fs from 'node:fs'
const p = 'src/qq-panel.html'
let s = fs.readFileSync(p, 'utf8')
const nl = s.includes('\r\n') ? '\r\n' : '\n'

// 1) effRow 移出自定义盒（常显）
const oldAppend = [
  "          cust.appendChild(mkRow('provider（如 wb）', 'f-defaultModel-p'));",
  "          cust.appendChild(mkRow('model id（如 glm-5.3-flash）', 'f-defaultModel-m'));",
  '          cust.appendChild(effRow);',
  '          field.appendChild(cust);',
].join(nl)
if (!s.includes(oldAppend)) { console.error('append 锚点未找到'); process.exit(1) }
const newAppend = [
  "          cust.appendChild(mkRow('provider（如 wb）', 'f-defaultModel-p'));",
  "          cust.appendChild(mkRow('model id（如 glm-5.3-flash）', 'f-defaultModel-m'));",
  "      effRow.style.marginTop = '9px';",
  '      field.appendChild(effRow);',
  '          field.appendChild(cust);',
].join(nl)
s = s.replace(oldAppend, newAppend)

// 2) modelText：catalog 也带力度段
const oldText = "      return sel.value;" + nl + '  },'
if (!s.includes(oldText)) { console.error('modelText 锚点未找到'); process.exit(1) }
s = s.replace(oldText, "      return sel.value + '|' + ($('f-defaultModel-e')?.value || '');" + nl + '  },')

// 3) save：力度始终随补丁发送
const oldSave = [
  '        if (t) {',
  "          const [p, m, e] = t.split('|');",
  "          patch['defaultModel.provider'] = p;",
  "          patch['defaultModel.model'] = m;",
  "          if (e) patch['defaultModel.reasoningEffort'] = e;",
  '        }',
  '        continue;',
].join(nl)
if (!s.includes(oldSave)) { console.error('save 锚点未找到'); process.exit(1) }
const newSave = [
  '        if (t) {',
  "          const [p, m, e] = t.split('|');",
  "          patch['defaultModel.provider'] = p;",
  "          patch['defaultModel.model'] = m;",
  "          patch['defaultModel.reasoningEffort'] = e;  // '' = 重置为跟随默认",
  '        }',
  '        continue;',
].join(nl)
s = s.replace(oldSave, newSave)

fs.writeFileSync(p, s)
console.log('✓ effort 常显 + catalog 带力度 + 清空重置（patch 完成）')
