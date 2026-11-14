import fs from 'node:fs'
const p = 'src/index.ts'
let s = fs.readFileSync(p, 'utf8')
const nl = s.includes('\r\n') ? '\r\n' : '\n'

// 1) inbox 清理方法（挂在 start() 前）+ 定时器字段
if (!s.includes('startInboxCleanup')) {
  const method = [
    '  /** inbox 清理（2026-11-14 owner 令）：30 天过期 + 500MB 总量上限；启动时 + 每 6 小时 */',
    '  private inboxTimer: NodeJS.Timeout | null = null',
    '  startInboxCleanup(): void {',
    "    const inboxDir = path.join(this.config.workspacePath ?? process.cwd(), 'inbox')",
    '    const clean = async (): Promise<void> => {',
    '      try {',
    '        const names = await fs.readdir(inboxDir).catch(() => [] as string[])',
    '        const files: Array<{ file: string; mtime: number; size: number }> = []',
    '        for (const n of names) {',
    '          const st = await fs.stat(path.join(inboxDir, n)).catch(() => null)',
    '          if (st && st.isFile()) files.push({ file: path.join(inboxDir, n), mtime: st.mtimeMs, size: st.size })',
    '        }',
    '        const cutoff = Date.now() - 30 * 24 * 3600 * 1000',
    '        let deleted = 0',
    '        let total = 0',
    '        const keep: Array<{ file: string; mtime: number; size: number }> = []',
    '        for (const f of files.sort((a, b) => a.mtime - b.mtime)) {',
    '          if (f.mtime < cutoff) { await fs.unlink(f.file).catch(() => {}); deleted++; continue }',
    '          total += f.size',
    '          keep.push(f)',
    '        }',
    '        if (total > 500 * 1024 * 1024) {',
    '          for (const f of keep) {',
    '            if (total <= 500 * 1024 * 1024) break',
    '            await fs.unlink(f.file).catch(() => {})',
    '            total -= f.size',
    '            deleted++',
    '          }',
    '        }',
    '        if (deleted > 0) this.log(`inbox cleanup: 删除 ${deleted} 个过期/超限文件（30天/500MB 策略）`)',
    '      } catch (e) { this.log(`inbox cleanup failed: ${e instanceof Error ? e.message : String(e)}`) }',
    '    }',
    '    void clean()',
    '    this.inboxTimer = setInterval(() => { void clean() }, 6 * 3600 * 1000)',
    '  }',
  ].join(nl)
  // 插在 startInboxCleanup 调用点前的类方法区——锚：start() 方法里 client.start() 行之前的方法区不好定，直接插在 start() 前
  const startAnchor = '  start(): void {'
  if (!s.includes(startAnchor)) { console.error('start() 锚点缺失'); process.exit(1) }
  s = s.replace(startAnchor, method + nl + '  start(): void {')
  console.log('✓ 清理方法已加')
} else console.log('已在')

// 2) start() 里调用
if (!s.includes('    this.startInboxCleanup()')) {
  const startCall = '    this.client.start()'
  if (!s.includes(startCall)) { console.error('start 调用锚点缺失'); process.exit(1) }
  s = s.replace(startCall, '    this.startInboxCleanup()' + nl + '    this.client.start()')
  console.log('✓ start() 已调用')
}

// 3) 卸载时清定时器
if (!s.includes('this.inboxTimer = null')) {
  const disAnchor = '      this.client?.stop()'
  if (!s.includes(disAnchor)) { console.error('disposer 锚点缺失'); process.exit(1) }
  s = s.replace(disAnchor, disAnchor + nl + '      if (this.inboxTimer) { clearInterval(this.inboxTimer); this.inboxTimer = null }')
  console.log('✓ 卸载清理已挂')
}

fs.writeFileSync(p, s)
console.log('✓ index.ts 完成')
