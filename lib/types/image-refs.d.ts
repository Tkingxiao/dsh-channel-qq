/**
 * 图片附件引用登记簿（2026-11-14 卡点2a 修复）：
 * channel-qq 收到群/私聊图片时 saveImage 会产生 attachmentId，但 meme 组件的
 * learn_meme 原来只能从「本轮对话」的会话内容里找附件——两轮前的图就查不到了。
 * 这里保存最近 N 个 {attachmentId → 完整 ref}，learn_meme 按 id 直查，不再受
 * 会话窗口限制。进程内单例，重启即清（附件本体在 attachments 服务里持久保存）。
 */
export declare function rememberImageRef(ref: unknown): void;
export declare function findImageRef(attachmentId: string): unknown | undefined;
