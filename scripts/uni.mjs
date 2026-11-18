import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWechatConfig, loadWechatEnv, wechatMode } from './wechat-release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const [command = 'dev', platform = 'h5', ...flags] = process.argv.slice(2);
if (!['dev', 'build', 'preview'].includes(command) || !['h5', 'mp-weixin'].includes(platform)) {
  throw new Error('Usage: node scripts/uni.mjs <dev|build|preview> <h5|mp-weixin> [options]');
}
if (command === 'preview' && platform !== 'h5') {
  throw new Error('微信小程序请导入微信开发者工具；preview 仅用于 H5。');
}

// Load before starting Vite: vite.config.ts reads process.env in its define.
const release = flags.includes('--release');
const cliFlags = flags.filter(flag => flag !== '--release');
const watch = flags.includes('--watch') || flags.includes('-w');
if (release && (command !== 'build' || platform !== 'mp-weixin' || watch)) {
  throw new Error('--release 仅支持非 watch 的 build mp-weixin。');
}
const mode = wechatMode(cliFlags, command === 'dev' || watch ? 'development' : 'production');
const env = {
  ...loadWechatEnv(root, mode),
  WECHAT_RELEASE: release ? '1' : '0',
  UNI_INPUT_DIR: resolve(root, 'uniapp'),
  UNI_PLATFORM: platform,
  VITE_ROOT_DIR: platform === 'h5' ? resolve(root, 'uniapp') : root,
  UNI_OUTPUT_DIR: resolve(root, 'dist', command === 'dev' ? 'dev' : 'build', platform),
};

if (platform === 'mp-weixin') {
  assertWechatConfig(env, release);
  if (env.WECHAT_APPID === 'touristappid') {
    console.warn('[uni-app] 未配置真实 WECHAT_APPID：将生成完整游客工程；开发者工具若拒绝游客 AppID，需配置真实 AppID 后重新构建。微信云联机和真机预览仍需真实 AppID。');
  }
  if (!env.WECHAT_CLOUD_ENV) {
    console.warn('[uni-app] 未配置 WECHAT_CLOUD_ENV：可体验独自练习和同屏切磋；微信好友房仍需配置云环境并部署本次输出的 reversiRoom。');
  }
}
if (command === 'preview' && !existsSync(resolve(env.UNI_OUTPUT_DIR, 'index.html'))) {
  throw new Error('未找到 H5 构建产物，请先运行 npm run build:h5，再运行 npm run preview:h5。');
}

const cli = command === 'preview'
  ? resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js')
  : resolve(dirname(require.resolve('@dcloudio/vite-plugin-uni/package.json')), 'bin/uni.js');
const config = resolve(root, platform === 'mp-weixin' ? 'scripts/uni-wechat.config.mjs' : 'vite.config.ts');
const args = command === 'preview'
  ? ['preview', '--host', '0.0.0.0', '--port', '4175', '--strictPort', '--outDir', env.UNI_OUTPUT_DIR, ...cliFlags, '--config', config]
  : [...(command === 'build' ? ['build'] : []), '-p', platform, ...cliFlags, '--config', config];
const child = spawn(process.execPath, [cli, ...args], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
