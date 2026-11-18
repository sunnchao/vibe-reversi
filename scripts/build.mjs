import { build } from 'esbuild';
import { mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertWechatConfig, loadWechatEnv, wechatMode, wechatVersion } from './wechat-release.mjs';

const root = resolve(import.meta.dirname, '..');
const buildWechat = process.argv.includes('--wechat');
const release = process.argv.includes('--release');
const flags = process.argv.slice(2);
if (release && !buildWechat) throw new Error('--release 仅支持微信工程构建。');
const env = buildWechat ? loadWechatEnv(root, wechatMode(flags)) : process.env;
if (buildWechat) assertWechatConfig(env, release);
const envId = env.WECHAT_CLOUD_ENV?.trim() || '';
const appId = env.WECHAT_APPID?.trim() || 'touristappid';
const define = { __WECHAT_CLOUD_ENV__: JSON.stringify(envId) };
const common = { bundle: true, target: 'es2020', define, logLevel: 'info' };

await Promise.all([
  build({ ...common, entryPoints: [resolve(root, 'src/game.ts')], outfile: resolve(root, 'game.js'), format: 'iife', globalName: 'Reversi' }),
  build({ ...common, entryPoints: [resolve(root, 'cloudfunctions/reversiRoom/index.ts')], outfile: resolve(root, 'cloudfunctions/reversiRoom/index.js'), platform: 'node', target: 'node18', format: 'cjs', external: ['wx-server-sdk'] }),
  build({ ...common, entryPoints: [resolve(root, 'src/preview-server.ts')], outfile: resolve(root, 'dist/preview-server.cjs'), platform: 'node', target: 'node18', format: 'cjs' }),
]);

if (buildWechat) {
  for (const type of ['game', 'miniprogram']) {
    const destination = resolve(root, `dist/wechat-${type}`);
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    await cp(resolve(root, 'assets'), resolve(destination, 'assets'), { recursive: true });
    await rm(resolve(destination, 'assets/reversi-table-source.jpg'), { force: true });
    await rm(resolve(destination, 'assets/README.md'), { force: true });
    await mkdir(resolve(destination, 'cloudfunctions/reversiRoom'), { recursive: true });
    await cp(resolve(root, 'cloudfunctions/reversiRoom/index.js'), resolve(destination, 'cloudfunctions/reversiRoom/index.js'));
    await cp(resolve(root, 'cloudfunctions/reversiRoom/package.json'), resolve(destination, 'cloudfunctions/reversiRoom/package.json'));
    const project = {
      description: `翻盘棋 ${type === 'game' ? '微信小游戏' : '原生小程序 Canvas'}`,
      projectname: `vibe-reversi-${type}`,
      compileType: type,
      appid: appId,
      libVersion: '3.14.2',
      cloudfunctionRoot: 'cloudfunctions/',
      setting: { es6: true, minified: true, urlCheck: true },
      packOptions: {
        ignore: [
          { type: 'folder', value: 'cloudfunctions' },
          { type: 'file', value: 'build-info.json' },
          { type: 'file', value: 'assets/README.md' },
        ],
      },
    };
    await writeFile(resolve(destination, 'project.config.json'), JSON.stringify(project, null, 2));
    if (type === 'game') {
      await cp(resolve(root, 'game.js'), resolve(destination, 'game.js'));
      await cp(resolve(root, 'game.json'), resolve(destination, 'game.json'));
    } else {
      await cp(resolve(root, 'wechat/miniprogram'), destination, { recursive: true });
      await build({ ...common, entryPoints: [resolve(root, 'src/wechat-app.ts')], outfile: resolve(destination, 'app.js'), format: 'cjs' });
      await build({ ...common, entryPoints: [resolve(root, 'src/wechat-miniprogram.ts')], outfile: resolve(destination, 'pages/index/index.js'), format: 'cjs' });
    }
    await writeFile(resolve(destination, 'build-info.json'), JSON.stringify({
      target: 'legacy', appId, cloudEnvConfigured: Boolean(envId.trim()),
      versionName: wechatVersion(root, 'legacy'), builtAt: new Date().toISOString(), type,
    }, null, 2));
  }
  console.log(`微信工程已生成：${appId === 'touristappid' ? '游客验证模式，联机需真实 AppID 和云环境' : 'AppID 已配置（隐藏）'}`);
}
