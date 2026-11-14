// 一次性迁移：把本地偷图表情（channel-qq/emoji/*.png）收进 QQ 账号收藏
// （SnowLuma add_custom_face, base64://），完成后 fetch_custom_face_detail 复核。
import fs from 'node:fs'
import path from 'node:path'
import WebSocket from 'ws'

const HOME = 'C:/Users/12997/AppData/Roaming/in.dsh-plug.dsh-launcher/homes/0.2.2-rc.2'
const URL_ = 'ws://127.0.0.1:3001'
const TOKEN = 'JGfEahcrFU3Uex3yoI_i07dTPS5IFxi3AntUijB_IGA'
const EMOJI_DIR = HOME + '/channel-qq/emoji'

const files = fs.readdirSync(EMOJI_DIR).filter((f) => /\.(png|gif|jpg|webp)$/i.test(f)).map((f) => path.join(EMOJI_DIR, f))
console.log('待迁移:', files.length, '张')
let echoSeq = 0
const pending = new Map()
const ws = new WebSocket(URL_, { headers: { Authorization: `Bearer ${TOKEN}` } })
let ready = false

function call(action, params) {
  return new Promise((resolve, reject) => {
    const echo = 'mig-' + echoSeq++
    pending.set(echo, { resolve, reject })
    ws.send(JSON.stringify({ action, params, echo }))
    setTimeout(() => { if (pending.has(echo)) { pending.delete(echo); reject(new Error(action + ' 超时')) } }, 45_000)
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

ws.on('open', async () => {
  ready = true
  let ok = 0, fail = 0
  for (const file of files) {
    try {
      const buf = fs.readFileSync(file)
      const res = await call('add_custom_face', { file: 'base64://' + buf.toString('base64') })
      if (res && res.status === 'ok' && Number(res.retcode) === 0) { ok++; console.log('✓', path.basename(file), '→ emoji_id', res.data?.emoji_id ?? '?') }
      else { fail++; console.log('✗', path.basename(file), JSON.stringify(res).slice(0, 120)) }
    } catch (e) { fail++; console.log('✗', path.basename(file), String(e).slice(0, 100)) }
    await sleep(1200) // 限速：QQ 收藏接口别打太密
  }
  console.log(`迁移完成: 成功 ${ok} / 失败 ${fail}`)
  // 复核
  try {
    const list = await call('fetch_custom_face_detail', { count: 100 })
    const n = Array.isArray(list.data) ? list.data.length : '?'
    console.log('收藏表情总数复核:', n)
  } catch (e) { console.log('复核失败:', String(e).slice(0, 80)) }
  ws.close(); process.exit(0)
})
ws.on('message', (buf) => {
  try { const d = JSON.parse(buf.toString()); if (d.echo && pending.has(d.echo)) { const p = pending.get(d.echo); pending.delete(d.echo); p.resolve(d) } } catch {}
})
ws.on('error', (e) => { console.log('WS ERROR:', e.message); process.exit(1) })
setTimeout(() => { console.log('TIMEOUT'); process.exit(2) }, 180_000)
