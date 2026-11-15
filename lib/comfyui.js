/** ComfyUI 生图接入（2026-11-16 owner 令）：HTTP API 排队 → 轮询 → 取图。
 *
 * 模板 = ComfyUI workflow JSON，放配置的 templatesDir。支持两种格式（自动识别）：
 *  · API 格式（开发者模式「保存(API格式)」导出）
 *  · UI 格式（普通保存）——内置 best-effort 转换：链接解析 + widget 值映射；
 *    含子图（subgraph）的 UI 文件不支持，报错指引改用 API 导出。
 *
 * 自愈重试（生成排队失败时最多两轮）：
 *  · value_not_in_list → 吸附到该 COMBO 的可用值（如 bf16/int8 模型变体）
 *  · missing_node_type → 剔除无下游消费的未知节点（如 rgthree 交互辅助节点）
 */
import fs from 'node:fs';
import path from 'node:path';
export function comfyTemplatesDir(config) {
    const configured = config.comfyui?.templatesDir;
    if (configured && configured.trim())
        return configured;
    const home = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh');
    return path.join(home, 'comfyui-templates');
}
/** 列出可用模板名（*.json）。目录不存在/为空时返回空数组，由工具给出可行动的错误。 */
export function listComfyTemplates(config) {
    const dir = comfyTemplatesDir(config);
    try {
        return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.json')).map(f => f.replace(/\.json$/i, ''));
    }
    catch {
        return [];
    }
}
function loadTemplate(config, name) {
    const dir = comfyTemplatesDir(config);
    const chosen = (name && name.trim()) || config.comfyui?.defaultTemplate || '';
    if (!chosen) {
        const available = listComfyTemplates(config);
        throw new Error(available.length
            ? `未指定模板。可用模板：${available.join('、')}（默认模板可在配置 comfyui.defaultTemplate 里设）`
            : `还没有任何模板：把 ComfyUI 导出的 workflow JSON 放进 ${dir}（文件名=模板名）`);
    }
    // 防路径穿越：只允许安全文件名（含空格与 +，适配 ComfyUI 导出习惯）
    if (!/^[\w\u4e00-\u9fa5.+ -]+$/.test(chosen))
        throw new Error(`模板名不合法：${chosen}`);
    const file = path.join(dir, chosen + '.json');
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    }
    catch {
        const available = listComfyTemplates(config);
        throw new Error(`模板 "${chosen}" 不存在。可用模板：${available.join('、') || '（目录为空：' + dir + '）'}`);
    }
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object')
        throw new Error(`模板 "${chosen}" 不是 ComfyUI workflow JSON`);
    // 自动识别格式：API 格式（键=节点id，值含 class_type）直接用；UI 格式（含 nodes 数组）转换
    const isApi = !Array.isArray(parsed.nodes) && Object.values(parsed).some(v => v && typeof v === 'object' && 'class_type' in v);
    const isUi = Array.isArray(parsed.nodes);
    const converted = isUi ? convertUiWorkflowToApi(text) : { workflow: parsed, widgetQueues: {} };
    return { workflow: converted.workflow, template: chosen, widgetQueues: converted.widgetQueues };
}
/** UI 格式 → API 格式转换（best effort）：链接解析 + widget 值映射。
 *  不支持子图（subgraph 实例节点）——命中时抛出带指引的错误。 */
export function convertUiWorkflowToApi(text) {
    const doc = JSON.parse(text);
    if (doc.definitions?.subgraphs?.length || doc.nodes?.some(n => String(n.type || '').split('-').length === 5)) {
        throw new Error('这个 workflow 含子图（subgraph），自动转换不支持——请在 ComfyUI 里启用开发者模式后用「保存(API格式)」导出，再放进模板目录');
    }
    // links 元素：[linkId, fromNodeId, fromSlot, toNodeId, toSlot, type] —— 源=fromNodeId+fromSlot
    const links = new Map();
    for (const l of doc.links || [])
        links.set(l[0], [l[1], l[2]]);
    const CONTROLS = new Set(['randomize', 'fixed', 'increment', 'decrement']);
    const out = {};
    const widgetQueues = {};
    for (const node of doc.nodes || []) {
        if (node.mode === 2 || node.mode === 4)
            continue; // bypassed/never：不进 API 图
        const cls = String(node.type || '');
        if (!cls || cls === 'MarkdownNote' || cls === 'Note' || cls === 'Reroute')
            continue;
        const inputs = {};
        let widgetIdx = 0;
        const wv = Array.isArray(node.widgets_values) ? node.widgets_values : [];
        for (const input of node.inputs || []) {
            const isWidget = Boolean(input.widget?.name);
            if (input.link != null) {
                // 连接输入获胜；但它若同时是 widget（值位仍在 widgets_values 里），必须推进索引
                if (isWidget)
                    widgetIdx += 1;
                const src = links.get(input.link);
                if (!src)
                    throw new Error(`节点 ${node.id} 的输入 "${input.name}" 指向断开的连线 ${input.link}——模板不完整`);
                inputs[input.name] = [String(src[0]), src[1]];
                continue;
            }
            // widget 输入 = 带 widget.name 的条目，按 widgets_values 顺序取值；
            // KSampler 类的 control_after_generate 占位值（randomize/fixed/…）跳过不映射。
            // 没有 widget.name 也没有 link 的条目 = 可选连接输入（shape 7）：置 null，不消费值。
            if (input.widget?.name) {
                let value = wv[widgetIdx];
                if (typeof value === 'string' && CONTROLS.has(value) && input.widget.name !== 'control_after_generate') {
                    widgetIdx += 1;
                    value = wv[widgetIdx];
                }
                inputs[input.name] = value;
                widgetIdx += 1;
            }
            else if (input.shape !== 7) {
                // 旧格式兜底：无 widget 名也无 shape 标记的空输入按旧 widget 处理
                inputs[input.name] = wv[widgetIdx];
                widgetIdx += 1;
            }
            else {
                inputs[input.name] = null;
            }
        }
        const apiNode = { class_type: cls, inputs };
        if (node.title)
            apiNode._meta = { title: node.title };
        out[String(node.id)] = apiNode;
        // 记录该节点的 widget 值队列（含连链占位）：运行时 schema 回填用
        const queue = [];
        let qi = 0;
        for (const input of node.inputs || []) {
            if (!input.widget?.name)
                continue;
            let value = wv[qi];
            if (typeof value === 'string' && CONTROLS.has(value) && input.widget.name !== 'control_after_generate') {
                qi += 1;
                value = wv[qi];
            }
            queue.push({ name: input.widget.name, value });
            qi += 1;
        }
        widgetQueues[String(node.id)] = queue;
    }
    if (!Object.keys(out).length)
        throw new Error('转换结果为空——这不是可用的 ComfyUI workflow');
    return { workflow: out, widgetQueues };
}
const SEED_CLASSES = /^KSampler|Seed/i;
/** 找「正/负向提示词」应该写到哪：CLIPTextEncode（经典）；或带 prompt/positive widget 的节点；
 *  或 prompt 输入经链路来自字符串源节点（PrimitiveString 类，Qwen 等新模板走这条）。 */
function promptTargets(workflow, kind) {
    const results = [];
    const negRe = /negative_prompt|negative|负向|负面/;
    for (const node of Object.values(workflow)) {
        const inputs = (node.inputs || {});
        const names = Object.keys(inputs);
        const want = kind === 'negative' ? names.filter(n => negRe.test(n)) : names.filter(n => /^(prompt|positive|positive_prompt|text)$/i.test(n));
        for (const name of want) {
            const v = inputs[name];
            if (typeof v === 'string')
                results.push({ inputs, inputName: name });
            else if (Array.isArray(v) && v.length === 2) {
                // 经链路来自字符串源节点：顺着找到源，写源节点的 widget
                const src = workflow[String(v[0])];
                const srcCls = String(src?.class_type || '');
                if (/PrimitiveString|Primitive/i.test(srcCls))
                    results.push({ inputs: (src.inputs || {}), inputName: 'value' });
            }
        }
        if (results.length)
            break; // 第一批命中的节点族就是目标（避免写满所有节点）
    }
    if (kind === 'negative' && !results.length) {
        // 经典管线：CLIPTextEncode 里 title 含 neg 的节点
        for (const node of Object.values(workflow)) {
            const inputs = (node.inputs || {});
            const meta = node._meta?.title;
            if (inputs.text !== undefined && /neg/i.test(String(meta || '')))
                results.push({ inputs, inputName: 'text' });
        }
    }
    return results;
}
/** 就地应用参数替换；返回实际使用的 seed（供复现）。 */
export function applyComfyOverrides(workflow, opts) {
    let seedUsed = null;
    for (const node of Object.values(workflow)) {
        const cls = String(node.class_type || '');
        const inputs = (node.inputs || {});
        if (SEED_CLASSES.test(cls) && 'seed' in inputs) {
            const wanted = Number(opts.seed);
            if (Number.isSafeInteger(wanted)) {
                inputs.seed = wanted;
                seedUsed = wanted;
            }
            else {
                const r = Math.floor(Math.random() * 4294967295);
                inputs.seed = r;
                seedUsed = r;
            }
        }
    }
    if (typeof opts.prompt === 'string' && opts.prompt.trim()) {
        for (const t of promptTargets(workflow, 'positive'))
            t.inputs[t.inputName] = opts.prompt;
    }
    if (typeof opts.negative === 'string' && opts.negative.trim()) {
        for (const t of promptTargets(workflow, 'negative'))
            t.inputs[t.inputName] = opts.negative;
    }
    // overrides 最后应用（显式指定优先于启发式）
    for (const [key, value] of Object.entries(opts.overrides || {})) {
        const segs = key.split('.');
        let cur = workflow[segs[0]];
        if (!cur || typeof cur !== 'object')
            continue;
        let ok = true;
        for (const seg of segs.slice(1, -1)) {
            const next = cur[seg];
            if (!next || typeof next !== 'object') {
                ok = false;
                break;
            }
            cur = next;
        }
        if (ok && segs.length >= 2)
            cur[segs[segs.length - 1]] = value;
    }
    return seedUsed;
}
/** 自愈重试：值吸附（value_not_in_list → COMBO 可用值）+ 未知节点剔除（missing_node_type 且无下游消费）。 */
function selfHeal(workflow, body) {
    const notes = [];
    let touched = false;
    // 缺失节点事件可能出现在 node_errors（逐节点）或顶层 error.extra_info（单节点）——统一收集
    const missing = [];
    for (const [id, e] of Object.entries(body.node_errors || {})) {
        for (const err of e.errors || []) {
            if (err.type === 'missing_node_type') {
                missing.push({ nodeId: String(err.extra_info?.node_id || '').replace('#', ''), cls: String(err.extra_info?.class_type || e.class_type || '') });
            }
        }
    }
    const topInfo = body.error?.extra_info;
    if (body.error?.type === 'missing_node_type' && topInfo?.node_id) {
        missing.push({ nodeId: String(topInfo.node_id).replace('#', ''), cls: String(topInfo.class_type || '') });
    }
    for (const { nodeId, cls } of missing) {
        const node = workflow[nodeId];
        if (!node)
            continue;
        const consumed = Object.values(workflow).some(n => {
            const inputs = (n.inputs || {});
            return Object.values(inputs).some(v => Array.isArray(v) && String(v[0]) === nodeId);
        });
        if (!consumed) {
            delete workflow[nodeId];
            notes.push(`节点 ${nodeId}（${cls || String(node.class_type)}）：未安装的自定义节点且无下游消费，已剔除`);
            touched = true;
        }
    }
    for (const [id, e] of Object.entries(body.node_errors || {})) {
        for (const err of e.errors || []) {
            if (err.type === 'value_not_in_list') {
                const name = String(err.extra_info?.input_name || '');
                const options = err.extra_info?.input_config?.[0];
                const candidates = Array.isArray(options) ? options : [];
                const received = String(err.extra_info?.received_value ?? (workflow[id]?.inputs || {})[name]);
                if (name && candidates.length && workflow[id]?.inputs) {
                    ;
                    workflow[id].inputs[name] = candidates[0];
                    notes.push(`节点 ${id}.${name}：${received.slice(0, 40)} → 吸附到可用值 ${String(candidates[0]).slice(0, 60)}`);
                    touched = true;
                }
            }
            else if (err.type === 'invalid_input_type') {
                // widget 映射错位产生的残值（如 INT 输入拿到 ''）：置 null 让 ComfyUI 用默认值
                const name = String(err.extra_info?.input_name || '');
                if (name && workflow[id]?.inputs) {
                    ;
                    workflow[id].inputs[name] = null;
                    notes.push(`节点 ${id}.${name}：类型不匹配的值已清空（用默认值）`);
                    touched = true;
                }
            }
            else if (err.type === 'required_input_missing') {
                const name = String(err.extra_info?.input_name || '');
                if (name && workflow[id]?.inputs && workflow[id].inputs[name] === undefined) {
                    ;
                    workflow[id].inputs[name] = null;
                    notes.push(`节点 ${id}.${name}：缺失的可选输入置空`);
                    touched = true;
                }
            }
        }
    }
    void touched;
    return notes;
}
/** 排队 + 自愈重试 + 轮询 + 下载产物图片。 */
export async function comfyGenerate(config, opts) {
    const base = (config.comfyui?.url || 'http://127.0.0.1:8188').replace(/\/+$/, '');
    const loaded = loadTemplate(config, opts.template);
    const workflow = loaded.workflow;
    const template = loaded.template;
    const widgetQueues = loaded.widgetQueues;
    const timeoutMs = Number(config.comfyui?.timeoutMs) || 300_000;
    const snaps = [];
    let queued = '';
    const seedUsed = applyComfyOverrides(workflow, opts);
    // 2026-11-16：schema 回填——inputs:[] 的纯 widget 节点（UI 转换产物）没有输入名，
    // 运行时向 ComfyUI /object_info/<类名> 查 required 输入表，按 widgets_values 队列顺序回填。
    const schemaCache = new Map();
    for (const [id, nodeRaw] of Object.entries(workflow)) {
        const node = nodeRaw;
        const cls = String(node.class_type || '');
        let schema = schemaCache.get(cls);
        if (schema === undefined) {
            try {
                const res = await fetch(`${base}/object_info/${encodeURIComponent(cls)}`, { signal: AbortSignal.timeout(15_000) });
                const body = await res.json();
                schema = (body[cls]?.input?.required || {});
            }
            catch {
                schema = {};
            }
            schemaCache.set(cls, schema);
        }
        const queue = widgetQueues[id];
        const requiredNames = Object.keys(schema);
        if (!requiredNames.length)
            continue;
        // ① 名字键控的队列值优先（UI widget 名与 schema 输入名一一对应）；
        //    连链输入已有值不覆盖；override 已设的不覆盖。
        for (const entry of queue) {
            const name = String(entry?.name || '');
            if (!name || !(name in schema))
                continue;
            if (node.inputs[name] !== undefined)
                continue;
            node.inputs[name] = entry.value;
        }
        // ② schema 默认值/COMBO 首选项兜底（inputs:[] 的节点没有队列值）
        for (const name of requiredNames) {
            if (node.inputs[name] !== undefined)
                continue;
            const spec = schema[name];
            if (!Array.isArray(spec))
                continue;
            const head = spec[0];
            const cfg = (spec[1] && typeof spec[1] === 'object') ? spec[1] : {};
            if ('default' in cfg && cfg.default !== undefined)
                node.inputs[name] = cfg.default;
            else if (Array.isArray(head) && head.length)
                node.inputs[name] = head[0];
        }
    }
    for (let attempt = 0; attempt < 4; attempt++) { // 3 轮自愈 + 1 轮最终提交
        let body;
        try {
            const res = await fetch(base + '/prompt', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: workflow, client_id: 'dsh-channel-qq' }),
                signal: AbortSignal.timeout(15_000),
            });
            body = await res.json();
        }
        catch (error) {
            const msg = String(error.message || error);
            throw new Error(msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('aborted')
                ? `连不上 ComfyUI（${base}）：确认它已启动，或把配置 comfyui.url 改成实际地址`
                : '排队失败：' + msg);
        }
        if (body.prompt_id) {
            queued = body.prompt_id;
            break;
        }
        // 排队失败：自愈一轮再试
        const notes = selfHeal(workflow, body);
        if (opts.debug)
            console.log('[comfy attempt ' + attempt + '] notes: ' + JSON.stringify(notes) + ' | body: ' + JSON.stringify({ e: body.error, ne: Object.keys(body.node_errors || {}) }).slice(0, 400));
        if (!notes.length || attempt === 2) {
            const first = Object.values(body.node_errors || {})[0]?.errors?.[0];
            const detail = first ? `${first.type}: ${String(first.details).slice(0, 200)}` : (body.error?.details || body.error?.type || '未知错误');
            throw new Error(`ComfyUI 校验失败：${detail}${notes.length ? '（自愈后仍有问题）' : ''}`);
        }
        snaps.push(...notes);
    }
    // 轮询 history 直到完成
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1500));
        let history = {};
        try {
            const res = await fetch(`${base}/history/${queued}`, { signal: AbortSignal.timeout(10_000) });
            history = (await res.json());
        }
        catch {
            continue;
        }
        const entry = history[queued];
        if (!entry)
            continue;
        const outputs = entry.outputs || {};
        const images = Object.values(outputs).flatMap(o => o.images || []).filter(img => (img.type || 'output') === 'output');
        if (images.length) {
            const buffers = [];
            for (const img of images.slice(0, 3)) {
                const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || '', type: img.type || 'output' });
                const res = await fetch(`${base}/view?${q}`, { signal: AbortSignal.timeout(60_000) });
                if (!res.ok)
                    continue;
                const buf = Buffer.from(await res.arrayBuffer());
                if (buf.length > 0 && buf.length <= 20 * 1024 * 1024)
                    buffers.push(buf);
            }
            if (buffers.length)
                return { images: buffers, seedUsed, template, queued: images.length, snaps };
            throw new Error('生成完成但取图失败（/view 下载为空）');
        }
        if (entry.status?.completed === true && !images.length)
            throw new Error('生成完成但没有图片输出——检查模板的 SaveImage/PreviewImage 节点');
    }
    throw new Error(`生成超时（${Math.round(timeoutMs / 1000)}s）——模型可能太大或队列太长，稍后再试或换轻量模板${snaps.length ? '；自动适配：' + snaps.join('；') : ''}`);
}
