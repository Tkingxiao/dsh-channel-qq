import fs from 'node:fs'
const p = 'src/tools.ts'
let s = fs.readFileSync(p, 'utf8')
const nl = s.includes('\r\n') ? '\r\n' : '\n'

// 1) import qq-sticker
if (!s.includes("from './qq-sticker.js'")) {
  const impAnchor = "import { runMessageChain } from './chain.js'"
  if (!s.includes(impAnchor)) { console.error('import 锚点缺失'); process.exit(1) }
  s = s.replace(impAnchor, impAnchor + nl + "import { qqStickerMatch as qqStickerMatchClient, collectStickerFile as qqCollectStickerFile, listQqStickers } from './qq-sticker.js'")
  console.log('✓ import 已加')
}

// 2) qq_list_emojis run 体整段替换（从 run: 到本工具对象结束前的 "      },"）
const runStart = "      run: async () => {" + nl + "        if (library !== undefined) {"
const runEnd = "          note: '这是 QQ 账号的收藏表情（QQ 收藏）。发送用 [表情: id或备注或描述] 连锁标记或 qq_send_emoji(id=...)。'," + nl + '        }' + nl + '      },'
if (!s.includes(runStart) || !s.includes(runEnd)) { console.error('list run 体锚点缺失', s.includes(runStart), s.includes(runEnd)); process.exit(1) }
const i1 = s.indexOf(runStart)
const i2 = s.indexOf(runEnd) + runEnd.length
const newRun = [
  '      run: async () => {',
  "        const stickers = await listQqStickers(client, '', 60)",
  '        return {',
  '          count: stickers.length,',
  '          emojis: stickers.map((e) => ({ id: e.id, desc: e.desc, localNote: e.localNote, tags: e.tags, url: e.url })),',
  "          note: '这是 QQ 账号的收藏表情（QQ 收藏）。发送用 [表情: id或备注或描述] 连锁标记或 qq_send_emoji(id=...)。',",
  '        }',
  '      },',
].join(nl)
s = s.slice(0, i1) + newRun + s.slice(i2)
console.log('✓ qq_list_emojis run 体已整体替换')

// 3) 两处 chain deps 挂 qqStickerMatch
const depNeedle = '          client,' + nl
const depAdd = '          client,' + nl + '          qqStickerMatch: (desc) => qqStickerMatchClient(client, desc),' + nl
let depsCount = 0
while (s.includes(depNeedle)) { s = s.replace(depNeedle, depAdd); depsCount++ }
console.log('✓ chain deps 挂载:', depsCount, '处')

// 4) 新工具：qq_list_stickers + qq_collect_sticker，插在 qq_list_emojis 对象前
const toolAnchor = "      name: 'qq_list_emojis',"
if (!s.includes(toolAnchor)) { console.error('工具插入锚点缺失'); process.exit(1) }
const newTools = [
  '    {',
  "      name: 'qq_list_stickers',",
  "      description: '列出 QQ 账号的收藏表情（QQ 收藏，含 id/备注/标签）。等同 qq_list_emojis 的别名视图，优先用这个。',",
  '      parameters: { type: \'object\', properties: { query: { type: \'string\', description: \'按备注/标签过滤（可空）\' } } },',
  '      run: async (args) => {',
  "        const list = await listQqStickers(client, String(args.query ?? ''), 48)",
  '        return { count: list.length, stickers: list.map((e) => ({ id: e.id, desc: e.desc, localNote: e.localNote, tags: e.tags })) },',
  '      },',
  '    },',
  '    {',
  "      name: 'qq_collect_sticker',",
  "      description: '把本地图片文件收进 QQ 账号的收藏表情（之后 [表情: 描述] 会优先用它）。file 为图片绝对路径，remark 为收藏备注（≤20字，可选）。',",
  '      parameters: { type: \'object\', properties: { file: { type: \'string\', description: \'图片绝对路径\' }, remark: { type: \'string\', description: \'收藏备注（≤20字）\' } }, required: [\'file\'] },',
  '      run: async (args) => {',
  "        const entry = await qqCollectStickerFile(client, String(args.file), String(args.remark ?? ''))",
  '        return { ok: true, id: entry.id, desc: entry.desc, url: entry.url },',
  '      },',
  '    },',
  '    {',
].join(nl)
s = s.replace(toolAnchor, newTools + nl + toolAnchor)
fs.writeFileSync(p, s)
console.log('✓ 新工具已插入')
