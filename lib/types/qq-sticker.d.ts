/**
 * QQ 收藏表情（2026-11-14 owner 令，从旧版 dsh-qq 移植精简）：
 * - 源 = SnowLuma `fetch_custom_face_detail` 拉取的 QQ 账号收藏表情（TTL 60s 缓存）
 * - 写 = `add_custom_face`（base64://）把本地图片收进 QQ 收藏
 * - [表情: 描述] 连锁与表情搜索优先走 QQ 收藏，落空回退本地偷图库/meme pack
 */
import type { OneBotClient } from './onebot.js';
import { type StickerEntry } from './sticker-lib.js';
/** 从 SnowLuma 拉取 QQ 收藏表情并合并进本地认知库（失败返回 null，调用方用缓存）。 */
export declare function syncStickerLibrary(client: OneBotClient, force?: boolean): Promise<StickerEntry[] | null>;
/** 按 描述/备注/标签 匹配一张 QQ 收藏表情并取回图片字节（发消息用）。 */
export declare function qqStickerMatch(client: OneBotClient, desc: string): Promise<{
    b64: string;
    id: string;
    entry: StickerEntry;
} | null>;
/** 把表情图片 URL 拉回字节转 base64（仅 http/https、≤10MB，DNS 交给系统栈）。 */
export declare function stickerUrlToBase64(url: string): Promise<string | null>;
/** 把本地图片文件收进 QQ 收藏（add_custom_face, base64://），成功后强制刷新并返回条目。 */
export declare function collectStickerFile(client: OneBotClient, filePath: string, remark?: string): Promise<StickerEntry>;
/** 删除一张 QQ 收藏表情（delete_custom_face），成功后强制刷新本地库。 */
export declare function deleteSticker(client: OneBotClient, emojiId: string): Promise<void>;
/** 给 AI 的收藏表情列表（query 过滤，缺省全量前 48）。 */
export declare function listQqStickers(client: OneBotClient, query?: string, count?: number): Promise<StickerEntry[]>;
