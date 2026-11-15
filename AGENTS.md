# AGENTS.md — dsh-channel-qq 排雷档案与修改守则

QQ 通道插件（OneBot v11 / NapCat），cordis 插件包。本文件是给后续 AI agent / 维护者的
**排雷档案**：记录已排掉的雷、它们的共同模式、以及动这个代码库前必须跑的测试。

## 项目速览

- **构建**：`npm run build` = copy-life-assets.mjs（拷 `.html/.cjs/.js` 资产到 `lib/`）+ tsc。
  `src/` 是源，`lib/` 是构建产物——**改完 src 必须 rebuild**，运行时只加载 lib。
- **TS 部分**（tsc 编译，类型安全）：`src/*.ts`（bridge/tools/config/settings-api/outbound/…）
- **纯 JS 部分**（**只拷贝不编译，无类型保护，地雷高发区**）：`src/life/life-engine.js`、
  `src/life/kb.cjs`。改这两个文件后必须跑下文「测试协议」。
- 面板：`src/qq-panel.html`（单文件应用，CFG_GROUPS 数据驱动；settings-api.ts 的
  `HOT_SCALARS` 白名单是后端回读/写入的唯一通道，新增字段两边要同步）。

## 测试协议（动 life-engine.js / kb.cjs 之后必须全跑）

```bash
# 1. 语法 + 构建
node --check src/life/life-engine.js && node --check src/life/kb.cjs
npm run build

# 2. 静态未定义标识符扫描（NL/root/fs. 这类雷的探测器）
npx tsc --allowJs --checkJs --noEmit --target es2022 --module esnext \
  --moduleResolution bundler --strict false src/life/life-engine.js src/life/kb.cjs
# 只看 "Cannot find name"，应为 0。
# 注意：readCfg() 上 TS2339（cfg.xxx 不在 DEFAULTS）是【有意】的可选配置键
# （embedWorkerEntry/familyPeers/familyMap/soulTemplatesDir 等，均有 || / ?? 回落），
# 不要为消音把它们加进 DEFAULTS——空串会破坏 ?? 回落语义。

# 3. 运行时 harness（mock ctx 真跑 apply + 工具落盘，36 项断言）
node <harness路径>   # 见仓库外排雷工具，路径可在会话中重建

# 4. 面板 harness（jsdom 加载真 qq-panel.html + stub fetch，9 项断言）
#    覆盖：默认模型/推理力度选择器、save payload、脏检测
node <panel-test>/run.cjs        # 依赖：临时目录 npm i jsdom

# 5. settings-api harness（捕获 webServer 路由 + 模拟 POST，9 项断言）
#    覆盖：defaultModel.reasoningEffort 全链路、replyLength 三键、dmWindowMs
node <settings-api-harness.cjs>
```

harness 要点：临时目录作 DSH_HOME/workspace（绝不碰真实 ~/.dsh）；mock
`ctx.tools.register` / `ctx.systemPrompt.section` / `ctx.logger` / `ctx.subagents`；
断言覆盖工具注册数、self 六件套落盘、审计留痕、图边、任务账本、自画像生成。
jsdom 注意：需 polyfill `IntersectionObserver`；顶层 `const` 不跨 eval 持久化，
要在同一段 eval 尾部导出引用。

## 排雷档案（2026-11-15 大扫雷）

背景：历史魔改把 `dailySelfPortrait()` 的函数头留在 643 行，函数体却在文件后段——
中间 600+ 行工具注册与助手全被误包进该函数作用域，靠 `dailySelfPortrait()` 的调用时序侥幸工作。

| # | 位置(修复前) | 症状 | 根因 | 修法 | 探测手段 |
|---|---|---|---|---|---|
| 1 | life-engine 1274 | `self_profile_update` 报 `root is not defined` | 工具注册在 dailySelfPortrait 作用域外，`root` 从未定义 | 改自包含实现（`workspaceOf`+`appendJsonl`） | bot 实测 |
| 2 | life-engine 1281 | 二次报 `selfRoot is not defined` | 同上，`selfRoot`/`audit` 只在误包作用域内 | 括号复位手术：600 行注册提回 apply 层 | 括号深度扫描脚本 |
| 3 | life-engine 全文件 | `NL` 未定义（12 处引用） | 历史重构丢了 `const NL='\n'`；自画像素材/独白/反思拼接全靠 try/catch 静默瘫痪 | 模块顶层补 `const NL='\n'` | 运行时 harness |
| 4 | life-engine 1309 | `memory_link` 新工作区 ENOENT | `knowledge/` 目录不建直接 append | 3 处（graph.jsonl×2、interactions.jsonl）补 `mkdirSync(recursive)` | harness |
| 5 | life-engine 1159 | `sleepRun` 静默瘫痪 | 解构 `exec` 却按 execFile 四参调用 → ERR_INVALID_ARG_TYPE 被 try/catch 吞掉，**睡眠巩固/自动喂养从未 spawn 过** | 改解构 `execFile` | 静态扫描 TS2554 + node 复现 |
| 6 | kb.cjs 526 | 图边召回永远返回空 | `fs.existsSync/readFileSync` 前缀调用，但该文件只解构了 fs 函数无 `fs` 命名空间 | 改用解构名 `existsSync/readFileSync` | checkJs TS2304 |
| 7 | life-engine 330 | 提示词语气校准(Q3)从未生效 | 段内 `root` 未定义 | `path.join(workspaceOf(undefined),'self')` | checkJs TS2304 |
| 8 | life-engine 1043 | `task_log` 调用即 ReferenceError | 裸 `name`（应为 `agentName()`）；同款在家族专线投递里静默丢账 | 改 `agentName()` | harness 扩面 |
| 9 | 注入统计/注意力/任务账本/memState | 新工作区首用静默失效 | 4 处写盘前不建目录 | 各补 `mkdirSync` | mkdir 扫雷脚本 |
| 10 | panel/settings-api | 字数范围开关保存后"自动关闭" | `replyLength` 物化为 `{min,max}` 后无 `enabled` 字段，GET 回读 undefined | GET 三键推导式回读 | 用户实测 |

修复前的连带残骸（提升作用域后自动痊愈，当时全部是潜伏 ReferenceError）：
`audit()` 的 4 处区外调用（snoozeAlarmAlarm:399 / maybeReview:423 / memory_link / memory_forget）。

**非雷备注**（checkJs 会报但不要动）：
- `embed([query],'query')` 第二参被忽略——死参，端点本不区分 query/doc。
- `cfg` 可选键 TS2339 ×4 —— 见测试协议第 2 步说明。
- `kb.cjs` 无 `require.main` 守卫，`main()` 末尾 `process.exit(0)`——**不可在测试进程里 require**，
  只能子进程调用（`KB_WORKSPACE` env 指向临时工作区）。
- graphRecall 的端到端验证需要假 embed 端点（cmdSearch 先 embed 后图召回），成本高未做，
  靠 checkJs 清零 + 直改背书。

## 高危模式清单（改这个库时盯死这些）

1. **try/catch 空吞**：`catch { }` 把 ReferenceError/ENOENT 变成静默半瘫。
   新增 catch 时想清楚：吞掉后功能是"降级"还是"装作正常"。高危路径宁可 `ctx.logger?.warn`。
2. **作用域错位（括号手术后遗症）**：本文件经历过函数头误包 600 行的事故。
   移动/删除函数时用括号深度扫描确认边界；同名 helper 只留一份（dayTag 曾有双份）。
3. **写盘前建目录**：`appendFileSync/writeFileSync` 到 `workspace/self`、`knowledge/`、
   `.life/` 前必须 `mkdirSync(recursive)`——新工作区首用是必炸场景。
4. **child_process 选型**：`(file, args, opts, cb)` 四参只能 `execFile`；`exec` 收 4 参直接抛。
5. **ES 模块严格作用域**：块内 `const` 会遮蔽外层同名函数（audit:342 就是）；反之
   提升函数到外层时要确认没有 const 撞名（parse 期 SyntaxError，node --check 可兜底）。
6. **配置项双轨**：面板字段 = settings-api `HOT_SCALARS` 白名单 = config.ts 类型。
   三处缺一就是"保存了但没生效/回读错"（replyLength.enabled 事故）。
   可空对象（`X | null`）的开关态用"对象是否存在"表达时，GET 必须推导回读，不能裸 getPath。
7. **lib/ 是产物**：只改 src 不 rebuild = 白改。用 harness（跑 lib）当最终裁决。

## 通道行为速记（2026-11-15 现状）

- 回复字数范围：`replyLength {min,max} | null`，min 提示层 / max 硬闸（超限拒发重试），
  动态读 live config，面板可热改。
- 私聊连发攒批窗：`batching.dmWindowMs`（默认 5000ms，0=旧逐条直发），回合进行中只攒不发，
  idle 钩子（`onTurnIdle`）补发；群聊走独立攒批+概率闸+参与币。
- 自我文件：`<workspacePath>/self/` 下 99-种子/95-成长层/85-心境/自我认知/user画像/
  user心智模型，每次装配注入（`tongling:life:soul` 段）；工具链 self_*（见排雷档案 #1/#2）。
- `user心智模型.md` 是六个自我文件中唯一无专属写工具的（通用文件写即可）。
