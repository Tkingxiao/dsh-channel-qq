/**
 * QQ 收藏表情（2026-11-14 owner 令，从旧版 dsh-qq 移植精简）：
 * - 源 = SnowLuma `fetch_custom_face_detail` 拉取的 QQ 账号收藏表情（TTL 60s 缓存）
 * - 写 = `add_custom_face`（base64://）把本地图片收进 QQ 收藏
 * - [表情: 描述] 连锁与表情搜索优先走 QQ 收藏，落空回退本地偷图库/meme pack
 */
import fs from 'node:fs';
import path from 'node:path';
function defaultDshHome() {
    return process.env.DSH_HOME ?? path.join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh');
}
import { loadStickerStore, saveStickerStore, mergeStickerLibrary, findSticker, formatStickerList, matchStickerByQuery, } from './sticker-lib.js';
const STORE_FILE = path.join(defaultDshHome(), 'channel-qq', 'stickers.json');
const TTL = 60_000;
const MAX_BYTES = 10 * 1024 * 1024;
let entries = [];
let syncedAt = 0;
let syncing = null;
let lastSyncError = '';
try {
    entries = loadStickerStore(STORE_FILE);
}
catch { /* 还没有本地库 */ }
/** 从 SnowLuma 拉取 QQ 收藏表情并合并进本地认知库（失败返回 null，调用方用缓存）。 */
export async function syncStickerLibrary(client, force = false) {
    if (!force && syncedAt && Date.now() - syncedAt < TTL)
        return entries;
    if (syncing)
        return syncing;
    syncing = (async () => {
        try {
            const raw = await client.call('fetch_custom_face_detail', { count: 100 }, 15_000);
            const data = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : null;
            if (!Array.isArray(data))
                throw new Error('fetch_custom_face_detail 返回 data 不是数组');
            entries = mergeStickerLibrary(entries, data, { complete: data.length < 100 });
            syncedAt = Date.now();
            try {
                saveStickerStore(STORE_FILE, entries);
            }
            catch (e) { /* 只读不写降级 */ }
            return entries;
        }
        catch (e) {
            lastSyncError = e instanceof Error ? e.message : String(e);
            return null;
        }
        finally {
            syncing = null;
        }
    })();
    return syncing;
}
/** 按 描述/备注/标签 匹配一张 QQ 收藏表情并取回图片字节（发消息用）。 */
export async function qqStickerMatch(client, desc) {
    const list = await syncStickerLibrary(client);
    if (!list || list.length === 0)
        return null;
    const scored = list
        .map((e) => ({ e, s: matchStickerByQuery(e, desc) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s);
    const best = scored[0];
    if (!best)
        return null;
    const b64 = await stickerUrlToBase64(best.e.url);
    if (!b64)
        return null;
    return { b64, entry: best.e, id: best.e.id };
}
/** 把表情图片 URL 拉回字节转 base64（仅 http/https、≤10MB，DNS 交给系统栈）。 */
export async function stickerUrlToBase64(url) {
    const raw = String(url || '').trim();
    if (!/^https?:\/\//i.test(raw))
        return null;
    try {
        const res = await fetch(raw, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok)
            return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0 || buf.length > MAX_BYTES)
            return null;
        return 'base64://' + buf.toString('base64');
    }
    catch {
        return null;
    }
}
/** 把本地图片文件收进 QQ 收藏（add_custom_face, base64://），成功后强制刷新并返回条目。 */
export async function collectStickerFile(client, filePath, remark = '') {
    const buf = fs.readFileSync(filePath);
    if (buf.length === 0 || buf.length > MAX_BYTES)
        throw new Error(`图片大小越界（${buf.length} 字节，上限 10MB）`);
    const file = 'base64://' + buf.toString('base64');
    const addRes = (await client.call('add_custom_face', { file }, 30_000));
    const addOk = !!addRes && addRes.status === 'ok' && Number(addRes.retcode) === 0;
    if (!addOk)
        throw new Error(`add_custom_face 失败: ${addRes?.wording ?? addRes?.retcode ?? 'unknown'}`);
    const emojiId = String(addRes.data?.emoji_id || '');
    if (remark.trim() !== '') {
        try {
            await client.call('modify_custom_face', { emoji_id: emojiId, desc: remark.trim().slice(0, 20) }, 15_000);
        }
        catch { /* 备注失败不影响收藏 */ }
    }
    const synced = await syncStickerLibrary(client, true);
    const entry = (synced && findSticker(synced, emojiId)) || null;
    if (!entry)
        throw new Error(`已提交收藏（emoji_id ${emojiId}），但收藏列表还没刷出它，稍后用 qq_list_stickers 查看`);
    return entry;
}
/** 删除一张 QQ 收藏表情（delete_custom_face），成功后强制刷新本地库。 */
export async function deleteSticker(client, emojiId) {
    await client.call('delete_custom_face', { emoji_id: emojiId }, 30_000);
    await syncStickerLibrary(client, true);
}
/** 给 AI 的收藏表情列表（query 过滤，缺省全量前 48）。 */
export async function listQqStickers(client, query = '', count = 48) {
    const list = await syncStickerLibrary(client);
    if (!list)
        throw new Error('QQ 收藏表情同步失败: ' + (lastSyncError || '未知原因'));
    return formatStickerList(list, query, count).map((x) => {
        const found = findSticker(list, String(x.id));
        return { ...x, url: found?.url ?? String(x.url ?? '') };
    });
}
