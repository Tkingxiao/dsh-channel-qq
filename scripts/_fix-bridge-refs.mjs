import fs from 'node:fs'
const p = 'src/bridge.ts'
let s = fs.readFileSync(p, 'utf8')
const nl = s.includes('\r\n') ? '\r\n' : '\n'

// 1) import
if (!s.includes("from './image-refs.js'")) {
  const imp = "import { fileURLToPath } from 'node:url'"
  if (!s.includes(imp)) { console.error('import 锚点缺失'); process.exit(1) }
  s = s.replace(imp, imp + nl + "import { rememberImageRef } from './image-refs.js'")
  console.log('✓ import 已加')
}

// 2) attachImages 里登记 ref
const saveAnchor = "      } }).attachments).saveImage({ data: bytes, mediaType, name: `qq-image.${mediaType.slice(6)}` })" + nl + '      refs.push(ref)'
if (!s.includes(saveAnchor)) { console.error('save 锚点缺失'); process.exit(1) }
s = s.replace(saveAnchor,
  "      } }).attachments).saveImage({ data: bytes, mediaType, name: `qq-image.${mediaType.slice(6)}` })" + nl
  + '      rememberImageRef(ref)' + nl
  + '      refs.push(ref)')
console.log('✓ attachImages 已登记 ref')
fs.writeFileSync(p, s)
