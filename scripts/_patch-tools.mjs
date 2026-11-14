import fs from 'node:fs'
const p = 'src/tools.ts'
let s = fs.readFileSync(p, 'utf8')
const nl = s.includes('\r\n') ? '\r\n' : '\n'

// 1) import
if (!s.includes("from './qq-sticker.js'")) {
  s = s.replace("import { runMessageChain } from './chain.js'",
    "import { runMessageChain } from './chain.js'" + nl
    + "import { qqStickerMatch as qqStickerMatchClient, collectStickerFile as qqCollectStickerFile, listQqStickers } from './qq-sticker.js'")
}

// 2) 两个 chain deps 对象里挂 qqStickerMatch
const depNeedle = '          client,' + nl
const depAdd = '          client,' + nl + '          qqStickerMatch: (desc) => qqStickerMatchClient(client, desc),' + nl
const cnt = s.split(depNeedle).length - 1
if (cnt >= 2) s = s.replace(depNeedle, depAdd)
console.log('deps client 行出现:', cnt, '→ 已挂 qqStickerMatch')

// 3) 新工具：插在 qq_list_emojis 定义前
const marker = "      name: 'qq_list_emojis',"
if (!s.includes(marker)) { console.error('qq_list_emojis marker 未找到'); process.exit(1) }
const newTools = [
  "      name: 'qq_list_stickers',",
  "      description: '列出 QQ 账号的收藏表情（QQ 收藏里的表情包，含 id/备注/标签）。要发收藏表情：text 里用 [表情: 备注或描述或id]（QQ 收藏优先于本地表情库）。',
  "      parameters: { type: 'object', properties: { query: { type: 'string', description: '按备注/标签过滤（可空）' } } },",
  "      run: async (args) => {",
  "        const list = await listQqStickers(client, String(args.query ?? ''), 48)",
  "        return { count: list.length, stickers: list.map((e) => ({ id: e.id, desc: e.desc, localNote: e.localNote, tags: e.tags })) },",
  "      },",
  "    },",
  "    {",
  "      name: 'qq_collect_sticker',",
  "      description: '把本地图片文件收进 QQ 账号的收藏表情（之后 [表情: 描述] 会优先用它）。file 为图片绝对路径（咱的工作区/表情库里的图都行），remark 为收藏备注（≤20字，可选）。',
  "      parameters: { type: 'object', properties: { file: { type: 'string', description: '图片绝对路径' }, remark: { type: 'string', description: '收藏备注（≤20字）' } }, required: ['file'] },",
  "      run: async (args) => {",
  "        const entry = await qqCollectStickerFile(client, String(args.file), String(args.remark ?? ''))",
  "        return { ok: true, id: entry.id, desc: entry.desc, url: entry.url },",
  '      },',
  '    },',
  '    {',
].join(nl)
s = s.replace(marker, newTools + nl + marker)
fs.writeFileSync(p, s)
console.log('✓ tools.ts 完成：imports + deps×2 + 2 个新工具')
