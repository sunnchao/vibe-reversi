import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

export const wechatTargets = {
  uniapp: 'dist/build/mp-weixin',
  legacy: 'dist/wechat-miniprogram',
};

export function loadWechatEnv(root, mode = 'production') {
  // Keep explicit shell values (including empty strings) above every .env file.
  // loadEnv also handles mode-specific files and dotenv expansion for us.
  const env = { ...loadEnv(mode, root, 'WECHAT_'), ...process.env };
  env.WECHAT_APPID = env.WECHAT_APPID?.trim() || 'touristappid';
  env.WECHAT_CLOUD_ENV = env.WECHAT_CLOUD_ENV?.trim() || '';
  return env;
}

export function assertWechatConfig(env, release = false) {
  const appId = env.WECHAT_APPID?.trim() || 'touristappid';
  if (appId !== 'touristappid' && !/^wx[0-9a-f]{16}$/.test(appId)) {
    throw new Error('WECHAT_APPID 格式不正确，应为 wx 开头的 16 位十六进制小程序 AppID。');
  }
  if (release && appId === 'touristappid') {
    throw new Error('发布构建必须配置真实 WECHAT_APPID，不允许 touristappid。');
  }
  if (release && !env.WECHAT_CLOUD_ENV?.trim()) {
    throw new Error('发布构建必须配置 WECHAT_CLOUD_ENV。');
  }
}

export function wechatMode(flags, fallback = 'production') {
  let mode;
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index];
    if (flag === '--mode' || flag === '-m' || flag.startsWith('--mode=')) {
      if (mode !== undefined) throw new Error('--mode 只能指定一次。');
      mode = flag.startsWith('--mode=') ? flag.slice('--mode='.length) : flags[++index];
      if (!mode || mode.startsWith('-')) throw new Error('--mode 必须指定环境名称。');
    }
  }
  return mode ?? fallback;
}

export function wechatVersion(root, target) {
  if (!Object.hasOwn(wechatTargets, target)) throw new Error('--target 必须为 uniapp 或 legacy。');
  const file = target === 'uniapp' ? 'uniapp/manifest.json' : 'package.json';
  const source = JSON.parse(readFileSync(resolve(root, file), 'utf8'));
  const version = target === 'uniapp' ? source.versionName : source.version;
  if (typeof version !== 'string' || !version.trim()) throw new Error(`${file} 缺少有效版本号。`);
  return version.trim();
}
