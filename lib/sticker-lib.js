/**
 * QQ 收藏表情体系（从旧版 dsh-qq 的 sticker-lib.js 移植精简，2026-11-14 owner 令）。
 *
 * 源：SnowLuma `fetch_custom_face_detail` 返回的 QQ 账号收藏表情；
 * 本地 stickers.json 只是 AI 认知层（备注/标签/使用次数），不覆盖 QQ 的备注。
 * [表情: 描述] 连锁与表情搜索优先走这里，落空才回退本地偷图库/meme pack。
 */
import fs from 'node:fs';
import path from 'node:path';
function truncateByCodePoints(value, limit) {
    const arr = Array.from(String(value ?? ''));
    return arr.length <= limit ? arr.join('') : arr.slice(0, limit).join('');
}
/** 单行化自由文本（防跨会话提示注入：换行/控制符压平，见旧版 sticker-lib 的注入分析） */
export function sanitizeStickerText(value, max = 200) {
    const cleaned = String(value ?? '')
        .replace(/[\s\u00a0\u3000]+/g, ' ')
        .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, '')
        .trim();
    return truncateByCodePoints(cleaned, Math.max(1, Number(max) || 200));
}
function nowIso() {
    return new Date().toISOString();
}
export function normalizeStickerEntry(raw) {
    const entry = raw && typeof raw === 'object' ? raw : {};
    const id = String(entry.id || entry.emoji_id || entry.resId || '').trim();
    if (!id)
        return null;
    const tags = Array.isArray(entry.tags)
        ? entry.tags.map((t) => sanitizeStickerText(t, 24)).filter(Boolean).slice(0, 20)
        : [];
    return {
        id,
        resId: String(entry.resId || entry.emoji_id || id).trim(),
        url: String(entry.url || '').trim(),
        md5: String(entry.md5 || '').trim().toUpperCase(),
        desc: sanitizeStickerText(entry.desc, 80),
        localNote: sanitizeStickerText(entry.localNote, 200),
        tags,
        usage: sanitizeStickerText(entry.usage, 200),
        source: entry.source === 'local' ? 'local' : 'qq',
        useCount: Number(entry.useCount ?? 0) || 0,
        lastUsedAt: Number(entry.lastUsedAt ?? 0) || 0,
        createdAt: String(entry.createdAt || nowIso()),
        updatedAt: nowIso(),
    };
}
export function loadStickerStore(file) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entries = Array.isArray(parsed) ? parsed : parsed?.entries;
    return (Array.isArray(entries) ? entries : []).map((e) => normalizeStickerEntry(e)).filter((e) => e !== null);
}
export function saveStickerStore(file, entries) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(entries, null, 1));
}
/** 合并 QQ 端拉取的收藏：QQ 字段为准，AI 认知层（localNote/tags/usage）保留；complete=true 时清理 QQ 端已删除的条目。 */
export function mergeStickerLibrary(existing, fetched, { complete = true } = {}) {
    const out = existing.map((e) => normalizeStickerEntry(e)).filter((e) => e !== null);
    const byId = new Map(out.map((e) => [e.id, e]));
    const fetchedIds = new Set();
    for (const item of Array.isArray(fetched) ? fetched : []) {
        const it = item;
        const id = String(it?.emoji_id || it?.resId || it?.id || '').trim();
        if (id)
            fetchedIds.add(id);
    }
    for (const item of Array.isArray(fetched) ? fetched : []) {
        const it = item;
        const id = String(it.emoji_id || it.resId || it.id || '').trim();
        if (!id)
            continue;
        const old = byId.get(id);
        const merged = normalizeStickerEntry({
            ...(old || {}),
            id,
            resId: String(it.resId || it.emoji_id || id).trim(),
            url: String(it.url || old?.url || '').trim(),
            md5: String(it.md5 || old?.md5 || '').trim().toUpperCase(),
            desc: String(it.desc ?? old?.desc ?? '').trim(),
            localNote: old?.localNote || '',
            tags: old?.tags || [],
            usage: old?.usage || '',
            source: old?.source || 'qq',
            useCount: old?.useCount || 0,
            lastUsedAt: old?.lastUsedAt || 0,
            createdAt: old?.createdAt || nowIso(),
        });
        if (!merged)
            continue;
        if (!byId.has(id))
            out.push(merged);
        else {
            const idx = out.findIndex((e) => e.id === id);
            if (idx >= 0)
                out[idx] = merged;
        }
        byId.set(id, merged);
    }
    return out.filter((e) => !complete || e.source !== 'qq' || fetchedIds.has(e.id));
}
function stickerUrlKey(value) {
    const raw = String(value || '').trim();
    if (!/^https?:\/\//i.test(raw) && !/^[^\s/]+\/[^\s]*$/.test(raw))
        return '';
    try {
        const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
            return '';
        return `${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
    }
    catch {
        return '';
    }
}
/** id/resId/md5 精确匹配优先；URL 忽略协议、尾斜杠与查询参数。 */
export function findSticker(entries, ref) {
    const raw = String(ref ?? '').trim();
    if (!raw)
        return null;
    const md5 = raw.toUpperCase();
    const exact = entries.find((e) => e.id === raw || e.resId === raw || (e.md5 !== '' && e.md5 === md5));
    if (exact)
        return exact;
    const urlKey = stickerUrlKey(raw);
    return (urlKey && entries.find((e) => stickerUrlKey(e.url) === urlKey)) || null;
}
/** 描述/本地笔记/标签/用途 的包含式匹配打分（qqStickerMatch 与列表过滤共用）。 */
export function matchStickerByQuery(e, query) {
    const q = String(query ?? '').trim().toLowerCase();
    if (!q)
        return 0;
    const words = q.split(/[\s,，、]+/).filter(Boolean);
    let score = 0;
    const hay = `${e.desc} ${e.localNote} ${e.tags.join(' ')} ${e.usage}`.toLowerCase();
    for (const w of words) {
        if (w.length < 2)
            continue;
        if (hay.includes(w))
            score += w.length >= 3 ? 2 : 1;
        if (String(e.id).toLowerCase().includes(w) || e.resId.toLowerCase().includes(w))
            score += 1;
    }
    return score;
}
/** 给 AI 看的表情列表（query 匹配 desc/localNote/tags/usage/id/md5，按分排序）。 */
export function formatStickerList(entries, query = '', limit = 48) {
    const scored = entries
        .map((e) => ({ e, s: matchStickerByQuery(e, query) }))
        .filter((x) => !query || x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, Math.max(1, Number(limit) || 48));
    return scored.map(({ e }) => ({
        id: e.id,
        desc: e.desc,
        localNote: e.localNote,
        tags: e.tags,
        url: e.url,
        md5: e.md5,
        useCount: e.useCount,
    }));
}
