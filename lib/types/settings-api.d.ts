/** QQ 设置 API: settings-page backend for the bundled QQ settings section.
 *
 * GET  /channel-qq-api          → live hot settings (subset)
 * POST /channel-qq-api {patch}  → mutate the live config object in place
 *                                 (hot-apply: talkValue/requireMention/persona/
 *                                  dmGate/emoji take effect on the next event)
 *                                 and persist to <dshHome>/channel-qq/settings.json
 *                                 (re-applied over defaults on every boot).
 *
 * Security: loopback-only via Host-header check (DNS-rebinding safe, same as
 * the meme component), no secrets returned.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type QQChannelConfig } from './config.js';
/** 工具面复用：把白名单字段的 patch 应用到 live config 并合并进 overlay 文件。
 *  返回 applied 键列表。与 applyPatch/persistOverlay 同一套强制转换与白名单。 */
export declare function applyConfigOverlay(config: QQChannelConfig, dshHome: string, patch: Record<string, unknown>, whitelist?: readonly string[]): string[];
export declare function registerSettingsApi(ctx: Context, config: QQChannelConfig, dshHome: string, log: (line: string) => void, client?: {
    clientIdentity: import('./client-compat.js').ClientIdentity | null;
    connection: {
        mode: string;
        url: string;
    };
    isConnected?: () => boolean;
    forceReconnect?: () => void;
}, getBridge?: () => {
    hotReselectModel(): void;
} | null): () => void;
