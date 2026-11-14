import fs from 'node:fs'
const p = 'src/qq-panel.html'
let s = fs.readFileSync(p, 'utf8')
const nl = s.includes('\r\n') ? '\r\n' : '\n'

// 1) effRow 从自定义盒移到 field（常显）
const oldAppend = "      cust.appendChild(mkRow('provider（如 wb）', 'f-defaultModel-p'));" + nl + "      cust.appendChild(mkRow('model id（如 glm-5.3-flash）', 'f-defaultModel-m'));" + nl + '      cust.appendChild(effRow);' + nl + '      field.appendChild(cust);'
if (!s.includes(oldAppend)) { console.error('append 锚点未找到'); process.exit(1) }
const newAppend = "      cust.appendChild(mkRow('provider（如 wb）', 'f-defaultModel-p'));" + nl + "      cust.appendChild(mkRow('model id（如 glm-5.3-flash）', 'f-defaultModel-m'));" + nl + '      effRow.style.marginTop = \'9px\';' + nl + '      field.appendChild(effRow);' + nl + '      field.appendChild(cust);'
s = s.replace(oldAppend, newAppend)

// 2) modelText：catalog 也带力度段
const oldText = "      return sel.value;" + nl + '  },' + nl
if (!s.includes(oldText)) { console.error('modelText 尾部锚点未找到'); process.exit(1) }
s = s.replace(oldText, "      return sel.value + '|' + ($('f-defaultModel-e')?.value || '');" + nl + '  },' + nl)

// 3) save：力度始终随补丁发送（'' = 重置为跟随默认）
const oldSave = "        if (t) {" + nl + "          const [p, m, e] = t.split('|');" + nl + "          patch['defaultModel.provider'] = p;" + nl + "          patch['defaultModel.model'] = m;" + nl + "          if (e) patch['defaultModel.reasoningEffort'] = e;" + nl + '        }' + nl + '        continue;'
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

// 4) loadModels 快照幂等：catalog 选择时快照也要含力度
s = s.replace(
  "      this.snapshot['defaultModel'] = this.serialize('defaultModel');",
  "      this.snapshot['defaultModel'] = this.serialize('defaultModel');")

fs.writeFileSync(p, s)
console.log('✓ 思考等级常显 + catalog 带力度 + 清空重置')
