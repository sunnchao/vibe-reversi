import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { transformSync } from 'esbuild';
import { assertWechatConfig, wechatTargets, wechatVersion } from './wechat-release.mjs';

const root = resolve(import.meta.dirname, '..');
const { values } = parseArgs({
  options: {
    target: { type: 'string', default: 'uniapp' },
    project: { type: 'string' },
    version: { type: 'string' },
    'compile-only': { type: 'boolean' },
  },
});
const target = values.target;
if (!Object.hasOwn(wechatTargets, target)) {
  console.error('--target 必须为 uniapp 或 legacy。');
  process.exit(1);
}
const projectPath = resolve(root, values.project ?? wechatTargets[target]);
const compileOnly = values['compile-only'];
const requiredFiles = [
  'app.js',
  'app.json',
  'app.wxss',
  'pages/index/index.js',
  'pages/index/index.json',
  'pages/index/index.wxml',
  'cloudfunctions/reversiRoom/index.js',
  'cloudfunctions/reversiRoom/package.json',
  target === 'uniapp' ? 'static/reversi-table.jpg' : 'assets/reversi-table.jpg',
  'project.config.json',
  'build-info.json',
];
const errors = [];
const warnings = [];
const usableFiles = new Set();

for (const file of requiredFiles) {
  try {
    const stat = lstatSync(resolve(projectPath, file));
    if (!stat.isFile() || stat.size === 0) throw new Error('not a nonempty regular file');
    usableFiles.add(file);
  } catch {
    errors.push(`缺少或损坏发布文件（必须为非空普通文件）：${file}`);
  }
}

function readJson(file) {
  if (!usableFiles.has(file)) return null;
  try {
    const data = JSON.parse(readFileSync(resolve(projectPath, file), 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not an object');
    return data;
  } catch {
    // JSON parser errors may echo credentials from the input; keep diagnostics redacted.
    errors.push(`${file} 无法读取或不是有效的 JSON 对象`);
    return null;
  }
}

for (const file of requiredFiles.filter(file => file.endsWith('.js'))) {
  if (!usableFiles.has(file)) continue;
  try {
    const source = readFileSync(resolve(projectPath, file), 'utf8');
    if (!source.trim()) throw new Error('empty script');
    transformSync(source, { loader: 'js', logLevel: 'silent' });
  } catch {
    errors.push(`${file} 不是有效的 JavaScript 产物`);
  }
}
if (usableFiles.has(target === 'uniapp' ? 'static/reversi-table.jpg' : 'assets/reversi-table.jpg')) {
  const imagePath = resolve(projectPath, target === 'uniapp' ? 'static/reversi-table.jpg' : 'assets/reversi-table.jpg');
  const image = readFileSync(imagePath);
  if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff
    || image[image.length - 2] !== 0xff || image[image.length - 1] !== 0xd9) {
    errors.push('棋盘背景必须是完整的 JPEG 产物');
  }
}
for (const file of ['app.wxss', 'pages/index/index.wxml']) {
  if (usableFiles.has(file) && !readFileSync(resolve(projectPath, file), 'utf8').trim()) {
    errors.push(`${file} 不能为空白产物`);
  }
}
const projectConfig = readJson('project.config.json');
const appConfig = readJson('app.json');
const buildInfo = readJson('build-info.json');
readJson('pages/index/index.json');
const cloudPackage = readJson('cloudfunctions/reversiRoom/package.json');
const appId = projectConfig?.appid;

if (projectConfig?.compileType !== 'miniprogram') {
  errors.push('project.config.json 的 compileType 必须是 miniprogram');
}
if (!['', '.', './'].includes(projectConfig?.miniprogramRoot ?? '')) {
  errors.push('miniprogramRoot 必须指向当前发布目录');
}
if (projectConfig?.cloudfunctionRoot?.replace(/\/$/, '') !== 'cloudfunctions') {
  errors.push('cloudfunctionRoot 必须指向 cloudfunctions/');
}
const ignores = projectConfig?.packOptions?.ignore;
for (const item of [
  { type: 'folder', value: 'cloudfunctions' },
  { type: 'file', value: 'build-info.json' },
]) {
  if (!Array.isArray(ignores) || !ignores.some(ignore => ignore?.type === item.type
    && typeof ignore.value === 'string' && ignore.value.replace(/^\.\//, '').replace(/\/$/, '') === item.value)) {
    errors.push(`packOptions.ignore 必须排除 ${item.value}，避免进入客户端包`);
  }
}
try {
  if (typeof appId !== 'string' || !appId) throw new Error('project.config.json 缺少 AppID');
  assertWechatConfig({ WECHAT_APPID: appId }, false);
  if (!compileOnly && appId === 'touristappid') throw new Error('正式发布禁止 touristappid，必须配置真实 WECHAT_APPID');
} catch (error) {
  errors.push(error.message);
}
if (buildInfo?.target !== target) errors.push('build-info.json 的 target 与校验目标不一致，请重新构建');
if (buildInfo?.appId !== appId) errors.push('build-info.json 的 appId 与 project.config.json 不一致');
if (typeof buildInfo?.cloudEnvConfigured !== 'boolean') {
  errors.push('build-info.json 缺少有效的 cloudEnvConfigured 布尔值');
} else if (!compileOnly && !buildInfo.cloudEnvConfigured) {
  errors.push('发布包缺少 WECHAT_CLOUD_ENV，cloudEnvConfigured 必须为 true');
}
try {
  const version = wechatVersion(root, target);
  if (buildInfo?.versionName !== version || (values.version !== undefined && values.version !== version)) {
    errors.push('build-info.json/上传版本与当前目标源版本号不一致，请重新构建');
  }
} catch {
  errors.push('无法读取当前目标的源版本号');
}
if (typeof buildInfo?.builtAt !== 'string' || !Number.isFinite(Date.parse(buildInfo.builtAt))) {
  errors.push('build-info.json 缺少有效的 builtAt 构建时间');
}
if (!Array.isArray(appConfig?.pages) || appConfig.pages.join(',') !== 'pages/index/index') {
  errors.push('app.json 页面入口不正确');
}
if (appConfig?.window?.navigationBarTitleText !== '翻盘棋') {
  warnings.push('小程序导航栏标题不是「翻盘棋」');
}
if (cloudPackage?.main !== 'index.js' || typeof cloudPackage?.dependencies?.['wx-server-sdk'] !== 'string') {
  errors.push('reversiRoom/package.json 缺少 index.js 入口或 wx-server-sdk 依赖');
}

const iconPath = resolve(root, 'wechat/publish-assets/app-icon-512.png');
try {
  const bytes = readFileSync(iconPath);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || bytes.readUInt32BE(16) !== 512 || bytes.readUInt32BE(20) !== 512) {
    throw new Error('invalid icon');
  }
} catch {
  errors.push('缺少有效的 512×512 PNG 发布图标 wechat/publish-assets/app-icon-512.png');
}

function packageBytes(directory) {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    const rel = relative(projectPath, fullPath).replaceAll('\\', '/');
    if (rel === 'cloudfunctions' || rel === 'project.config.json' || rel === 'build-info.json') continue;
    if (entry.isSymbolicLink()) errors.push(`发布目录不应包含符号链接：${rel}`);
    else if (entry.isDirectory()) total += packageBytes(fullPath);
    else if (entry.isFile()) total += lstatSync(fullPath).size;
    else errors.push(`发布目录包含非普通文件：${rel}`);
  }
  return total;
}
let runtimeBytes = 0;
try {
  if (!lstatSync(projectPath).isDirectory()) throw new Error('not a directory');
  runtimeBytes = packageBytes(projectPath);
} catch {
  errors.push('发布目录不存在或无法读取');
}
if (runtimeBytes >= 2 * 1024 * 1024) {
  errors.push(`小程序主包 ${(runtimeBytes / 1024 / 1024).toFixed(2)} MB，必须小于 2 MB`);
} else if (runtimeBytes > 1.5 * 1024 * 1024) {
  warnings.push(`主包 ${(runtimeBytes / 1024 / 1024).toFixed(2)} MB 已超过 1.5 MB，请关注 2 MB 发布上限`);
}
for (const directory of ['assets', 'static']) {
  if (existsSync(resolve(projectPath, directory, 'app-icon-512.png'))) {
    errors.push(`发布图标不应位于运行包 ${directory} 目录`);
  }
}
if (existsSync(resolve(projectPath, '.cloudbase'))) {
  warnings.push('项目目录包含开发者工具生成的 .cloudbase 缓存，上传前可清理');
}

console.log(`发布目标：${target}`);
console.log(`发布目录：${projectPath}`);
console.log(`主包体积：${(runtimeBytes / 1024).toFixed(1)} KB`);
console.log(`AppID：${appId === 'touristappid' ? '游客（仅编译）' : appId ? '已配置（隐藏）' : '未配置'}`);
console.log(`云环境：${buildInfo?.cloudEnvConfigured === true ? '已配置（隐藏）' : '未配置'}`);
for (const warning of warnings) console.warn(`WARN：${warning}`);
for (const error of errors) console.error(`错误：${error}`);
if (errors.length) process.exit(1);
console.log(compileOnly ? '编译包校验通过。' : '正式发布包校验通过。');
