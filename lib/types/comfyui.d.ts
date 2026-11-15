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
import type { QQChannelConfig } from './config.js';
export interface ComfyGenerateResult {
    images: Buffer[];
    seedUsed: number | null;
    template: string;
    queued: number;
    snaps: string[];
}
export declare function comfyTemplatesDir(config: QQChannelConfig): string;
/** 列出可用模板名（*.json）。目录不存在/为空时返回空数组，由工具给出可行动的错误。 */
export declare function listComfyTemplates(config: QQChannelConfig): string[];
/** UI 格式 → API 格式转换（best effort）：链接解析 + widget 值映射。
 *  不支持子图（subgraph 实例节点）——命中时抛出带指引的错误。 */
export declare function convertUiWorkflowToApi(text: string): {
    workflow: Record<string, Record<string, unknown>>;
    widgetQueues: Record<string, Array<{
        name: string;
        value: unknown;
    }>>;
};
/** 就地应用参数替换；返回实际使用的 seed（供复现）。 */
export declare function applyComfyOverrides(workflow: Record<string, Record<string, unknown>>, opts: {
    prompt?: string;
    negative?: string;
    seed?: number;
    overrides?: Record<string, unknown>;
}): number | null;
/** 排队 + 自愈重试 + 轮询 + 下载产物图片。 */
export declare function comfyGenerate(config: QQChannelConfig, opts: {
    prompt?: string;
    negative?: string;
    seed?: number;
    overrides?: Record<string, unknown>;
    template?: string;
    debug?: boolean;
}): Promise<ComfyGenerateResult>;
