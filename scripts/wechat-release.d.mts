export const wechatTargets: { uniapp: string; legacy: string };
export function loadWechatEnv(root: string, mode?: string): NodeJS.ProcessEnv;
export function assertWechatConfig(env: NodeJS.ProcessEnv, release?: boolean): void;
export function wechatMode(flags: string[], fallback?: string): string;
export function wechatVersion(root: string, target: keyof typeof wechatTargets): string;
