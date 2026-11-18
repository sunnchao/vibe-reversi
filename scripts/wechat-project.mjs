import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { assertWechatConfig, loadWechatEnv, wechatTargets, wechatVersion } from './wechat-release.mjs';

const root = resolve(import.meta.dirname, '..');
const { values, positionals } = parseArgs({
  options: {
    legacy: { type: 'boolean' },
    release: { type: 'boolean' },
    'compile-only': { type: 'boolean' },
    mode: { type: 'string', short: 'm', default: 'production' },
  },
  allowPositionals: true,
});
const command = positionals[0] ?? 'open';
const target = values.legacy ? 'legacy' : 'uniapp';
const projectPath = resolve(root, wechatTargets[target]);

if (positionals.length > 1 || !['open', 'preview', 'upload', 'deploy-cloud'].includes(command)) {
  console.error('用法：node scripts/wechat-project.mjs <open|preview|upload|deploy-cloud> [--legacy] [--mode production] [--release|--compile-only]');
  process.exit(1);
}
// Opening a local project allows tourist builds; preview/upload/deploy never do.
const release = command !== 'open' || values.release === true;
if (values['compile-only'] && release) {
  console.error('--compile-only 仅适用于 open，不能跳过预览、上传或云部署的发布门禁。');
  process.exit(1);
}
const env = loadWechatEnv(root, values.mode);
try {
  assertWechatConfig(env, release);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const version = env.WECHAT_UPLOAD_VERSION?.trim();
const description = env.WECHAT_UPLOAD_DESC?.trim();
if (command === 'upload') {
  if (!version || !description) {
    console.error('上传前请设置 WECHAT_UPLOAD_VERSION 和 WECHAT_UPLOAD_DESC。');
    process.exit(1);
  }
  if (version !== wechatVersion(root, target)) {
    console.error('WECHAT_UPLOAD_VERSION 必须与当前目标的源版本号一致，请先更新对应 manifest/package 版本。');
    process.exit(1);
  }
}
const cliCandidates = [
  env.WECHAT_DEVTOOLS_CLI?.trim(),
  '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  '/Volumes/T7 Mac/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
].filter(Boolean);
const cliPath = cliCandidates.find(candidate => existsSync(candidate));
if (!cliPath) {
  console.error('未找到微信开发者工具 CLI。请设置 WECHAT_DEVTOOLS_CLI。');
  process.exit(1);
}

const buildArgs = target === 'uniapp'
  ? [resolve(root, 'scripts/uni.mjs'), 'build', 'mp-weixin', '--mode', values.mode, ...(release ? ['--release'] : [])]
  : [resolve(root, 'scripts/build.mjs'), '--wechat', ...(release ? ['--release'] : [])];
const build = spawnSync(process.execPath, buildArgs, { cwd: root, env, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const validate = spawnSync(
  process.execPath,
  [resolve(root, 'scripts/validate-wechat-release.mjs'), '--target', target, '--project', projectPath,
    ...(release ? [] : ['--compile-only']), ...(command === 'upload' ? ['--version', version] : [])],
  { cwd: root, env, stdio: 'inherit' }
);
if (validate.status !== 0) process.exit(validate.status ?? 1);

const cliArgs = command === 'deploy-cloud'
  ? [
      'cloud', 'functions', 'deploy',
      '--env', env.WECHAT_CLOUD_ENV,
      '--names', 'reversiRoom',
      '--project', projectPath,
      '--remote-npm-install', '--lang', 'zh',
    ]
  : [command, '--project', projectPath, '--lang', 'zh'];
if (command === 'upload') cliArgs.push('--version', version, '--desc', description);
if (command === 'preview') {
  await mkdir(resolve(root, 'output/wechat'), { recursive: true });
  cliArgs.push(
    '--qr-format', 'image',
    '--qr-output', resolve(root, 'output/wechat/preview.png'),
    '--info-output', resolve(root, 'output/wechat/preview-info.json')
  );
}

const result = spawnSync(cliPath, cliArgs, { cwd: root, env, stdio: 'inherit' });
process.exit(result.status ?? 1);
