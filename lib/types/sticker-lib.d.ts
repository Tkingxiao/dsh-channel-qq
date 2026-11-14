/**
 * QQ 收藏表情体系（从旧版 dsh-qq 的 sticker-lib.js 移植精简，2026-11-14 owner 令）。
 *
 * 源：SnowLuma `fetch_custom_face_detail` 返回的 QQ 账号收藏表情；
 * 本地 stickers.json 只是 AI 认知层（备注/标签/使用次数），不覆盖 QQ 的备注。
 * [表情: 描述] 连锁与表情搜索优先走这里，落空才回退本地偷图库/meme pack。
 */
export interface StickerEntry {
    id: string;
    resId: string;
    url: string;
    md5: string;
    desc: string;
    localNote: string;
    tags: string[];
    usage: string;
    source: 'qq' | 'local';
    useCount: number;
    lastUsedAt: number;
    createdAt: string;
    updatedAt: string;
}
/** 单行化自由文本（防跨会话提示注入：换行/控制符压平，见旧版 sticker-lib 的注入分析） */
export declare function sanitizeStickerText(value: unknown, max?: number): string;
export declare function normalizeStickerEntry(raw: unknown): StickerEntry | null;
export declare function loadStickerStore(file: string): StickerEntry[];
export declare function saveStickerStore(file: string, entries: StickerEntry[]): void;
/** 合并 QQ 端拉取的收藏：QQ 字段为准，AI 认知层（localNote/tags/usage）保留；complete=true 时清理 QQ 端已删除的条目。 */
export declare function mergeStickerLibrary(existing: StickerEntry[], fetched: unknown[], { complete }?: {
    complete?: boolean | undefined;
}): StickerEntry[];
/** id/resId/md5 精确匹配优先；URL 忽略协议、尾斜杠与查询参数。 */
export declare function findSticker(entries: StickerEntry[], ref: string): StickerEntry | null;
/** 描述/本地笔记/标签/用途 的包含式匹配打分（qqStickerMatch 与列表过滤共用）。 */
export declare function matchStickerByQuery(e: StickerEntry, query: string): number;
/** 给 AI 看的表情列表（query 匹配 desc/localNote/tags/usage/id/md5，按分排序）。 */
export declare function formatStickerList(entries: StickerEntry[], query?: string, limit?: number): Array<Record<string, unknown>>;
