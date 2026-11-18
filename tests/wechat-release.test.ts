import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWechatEnv, assertWechatConfig, wechatMode, wechatTargets } from '../scripts/wechat-release.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const validator = resolve(root, 'scripts/validate-wechat-release.mjs');
const appId = 'wx0000000000000000';
const cloudEnv = 'test-env';
const tempDirs: string[] = [];

async function makeProject(overrides: {
  appId?: string;
  target?: string;
  cloudEnvConfigured?: boolean;
  versionName?: string;
  builtAt?: string;
  compileType?: string;
  ignores?: Array<{ type: string; value: string }>;
} = {}) {
  const project = await mkdtemp(resolve(tmpdir(), 'wechat-release-'));
  tempDirs.push(project);
  const write = async (path: string, contents: string | Uint8Array) => {
    const absolute = resolve(project, path);
    await mkdir(resolve(absolute, '..'), { recursive: true });
    await writeFile(absolute, contents);
  };
  const ignored = overrides.ignores ?? [
    { type: 'folder', value: 'cloudfunctions' },
    { type: 'file', value: 'build-info.json' },
  ];
  await write('app.js', 'App({});\n');
  await write('app.json', JSON.stringify({
    pages: ['pages/index/index'], window: { navigationBarTitleText: '翻盘棋' },
  }));
  await write('app.wxss', 'page {}\n');
  await write('pages/index/index.js', 'Page({});\n');
  await write('pages/index/index.json', '{}\n');
  await write('pages/index/index.wxml', '<view />\n');
  await write('static/reversi-table.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  await write('cloudfunctions/reversiRoom/index.js', 'exports.main = async () => ({});\n');
  await write('cloudfunctions/reversiRoom/package.json', JSON.stringify({
    main: 'index.js', dependencies: { 'wx-server-sdk': 'latest' },
  }));
  await write('project.config.json', JSON.stringify({
    compileType: overrides.compileType ?? 'miniprogram',
    appid: overrides.appId ?? 'touristappid',
    miniprogramRoot: './', cloudfunctionRoot: 'cloudfunctions/',
    packOptions: { ignore: ignored },
  }));
  await write('build-info.json', JSON.stringify({
    target: overrides.target ?? 'uniapp',
    appId: overrides.appId ?? 'touristappid',
    cloudEnvConfigured: overrides.cloudEnvConfigured ?? false,
    versionName: overrides.versionName ?? '1.1.0',
    builtAt: overrides.builtAt ?? '2026-11-17T00:00:00.000Z',
  }));
  return project;
}

function validate(project: string, ...args: string[]) {
  return spawnSync(process.execPath, [validator, '--target', 'uniapp', '--project', project, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, WECHAT_APPID: appId, WECHAT_CLOUD_ENV: cloudEnv },
  });
}

async function runProjectScript(command: string, ...flags: string[]) {
  const hookDir = await mkdtemp(resolve(tmpdir(), 'wechat-cli-hook-'));
  tempDirs.push(hookDir);
  const hook = resolve(hookDir, 'mock-spawn.mjs');
  // Intercept every external process: these tests must never open DevTools,
  // compile into the shared dist directory, upload code or deploy a function.
  await writeFile(hook, `
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    childProcess.spawnSync = (command, args, options) => {
      console.log(JSON.stringify({ command, args, appId: options.env.WECHAT_APPID,
        cloudEnv: options.env.WECHAT_CLOUD_ENV }));
      return { status: 0 };
    };
    syncBuiltinESMExports();
  `);
  const result = spawnSync(process.execPath,
    ['--import', hook, resolve(root, 'scripts/wechat-project.mjs'), command, ...flags], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, WECHAT_APPID: appId, WECHAT_CLOUD_ENV: cloudEnv,
        WECHAT_UPLOAD_VERSION: '1.1.0', WECHAT_UPLOAD_DESC: 'test release',
        WECHAT_DEVTOOLS_CLI: process.execPath },
    });
  const calls = result.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as {
    command: string; args: string[]; appId: string; cloudEnv: string;
  });
  return { ...result, calls };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('微信发布脚本配置', () => {
  it('keeps shell values above all Vite env files', async () => {
    const envRoot = await mkdtemp(resolve(tmpdir(), 'wechat-env-'));
    tempDirs.push(envRoot);
    await writeFile(resolve(envRoot, '.env'), 'WECHAT_APPID=wx1111111111111111\nWECHAT_CLOUD_ENV=base\n');
    await writeFile(resolve(envRoot, '.env.local'), 'WECHAT_APPID=wx2222222222222222\nWECHAT_CLOUD_ENV=local\n');
    await writeFile(resolve(envRoot, '.env.production'), 'WECHAT_APPID=wx3333333333333333\nWECHAT_CLOUD_ENV=production\n');
    await writeFile(resolve(envRoot, '.env.production.local'), 'WECHAT_APPID=wx4444444444444444\nWECHAT_CLOUD_ENV=production-local\n');
    vi.stubEnv('WECHAT_APPID', appId);
    vi.stubEnv('WECHAT_CLOUD_ENV', cloudEnv);

    expect(loadWechatEnv(envRoot, 'production')).toMatchObject({ WECHAT_APPID: appId, WECHAT_CLOUD_ENV: cloudEnv });
    vi.stubEnv('WECHAT_APPID', '');
    vi.stubEnv('WECHAT_CLOUD_ENV', '');
    expect(loadWechatEnv(envRoot, 'production')).toMatchObject({ WECHAT_APPID: 'touristappid', WECHAT_CLOUD_ENV: '' });
  });

  it('uses Vite mode-local precedence and loads upload metadata', async () => {
    const envRoot = await mkdtemp(resolve(tmpdir(), 'wechat-env-files-'));
    tempDirs.push(envRoot);
    const keys = ['WECHAT_APPID', 'WECHAT_CLOUD_ENV', 'WECHAT_UPLOAD_VERSION', 'WECHAT_UPLOAD_DESC'];
    const saved = new Map(keys.map(key => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    try {
      await writeFile(resolve(envRoot, '.env'), 'WECHAT_APPID=wx1111111111111111\nWECHAT_CLOUD_ENV=base\n');
      await writeFile(resolve(envRoot, '.env.local'), 'WECHAT_APPID=wx2222222222222222\nWECHAT_CLOUD_ENV=local\n');
      await writeFile(resolve(envRoot, '.env.production'), 'WECHAT_APPID=wx3333333333333333\nWECHAT_CLOUD_ENV=production\n');
      expect(loadWechatEnv(envRoot, 'production')).toMatchObject({
        WECHAT_APPID: 'wx3333333333333333', WECHAT_CLOUD_ENV: 'production',
      });
      await writeFile(resolve(envRoot, '.env.production.local'),
        'WECHAT_APPID=wx4444444444444444\nWECHAT_CLOUD_ENV=production-local\nWECHAT_UPLOAD_VERSION=1.1.0\nWECHAT_UPLOAD_DESC=test release\n');
      expect(loadWechatEnv(envRoot, 'production')).toMatchObject({
        WECHAT_APPID: 'wx4444444444444444', WECHAT_CLOUD_ENV: 'production-local',
        WECHAT_UPLOAD_VERSION: '1.1.0', WECHAT_UPLOAD_DESC: 'test release',
      });
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('uses the intended targets, parses mode forms and gates release credentials', () => {
    expect(wechatTargets).toEqual({ uniapp: 'dist/build/mp-weixin', legacy: 'dist/wechat-miniprogram' });
    expect(wechatMode(['--mode', 'staging'], 'production')).toBe('staging');
    expect(wechatMode(['-m', 'test'], 'production')).toBe('test');
    expect(wechatMode(['--mode=ci'], 'production')).toBe('ci');
    expect(() => assertWechatConfig({ WECHAT_APPID: 'touristappid', WECHAT_CLOUD_ENV: cloudEnv }, true)).toThrow(/touristappid/);
    expect(() => assertWechatConfig({ WECHAT_APPID: appId, WECHAT_CLOUD_ENV: '' }, true)).toThrow(/WECHAT_CLOUD_ENV/);
    expect(() => assertWechatConfig({ WECHAT_APPID: appId, WECHAT_CLOUD_ENV: cloudEnv }, true)).not.toThrow();
  });
});

describe('微信发布产物校验', () => {
  it('permits a correctly built tourist compile-only project', async () => {
    const project = await makeProject();
    const result = validate(project, '--compile-only');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('编译包校验通过');
    expect(result.stdout).not.toContain(cloudEnv);
  });

  it('does not let compile-only bypass missing, empty or malformed required outputs', async () => {
    const missing = await makeProject();
    await rm(resolve(missing, 'pages/index/index.wxml'));
    const missingResult = validate(missing, '--compile-only');
    expect(missingResult.status).not.toBe(0);
    expect(missingResult.stderr).toContain('pages/index/index.wxml');

    const malformed = await makeProject();
    await writeFile(resolve(malformed, 'app.js'), 'App({\n');
    const malformedResult = validate(malformed, '--compile-only');
    expect(malformedResult.status).not.toBe(0);
    expect(malformedResult.stderr).toContain('app.js 不是有效的 JavaScript');

    const empty = await makeProject();
    await writeFile(resolve(empty, 'app.wxss'), '');
    expect(validate(empty, '--compile-only').status).not.toBe(0);

    const malformedJson = await makeProject();
    await writeFile(resolve(malformedJson, 'app.json'), '{broken');
    expect(validate(malformedJson, '--compile-only').status).not.toBe(0);

    const malformedImage = await makeProject();
    await writeFile(resolve(malformedImage, 'static/reversi-table.jpg'), 'not a jpeg');
    const imageResult = validate(malformedImage, '--compile-only');
    expect(imageResult.status).not.toBe(0);
    expect(imageResult.stderr).toContain('完整的 JPEG');
  });

  it('routes open as compile-only and all published tool operations as release builds', async () => {
    const open = await runProjectScript('open', '--compile-only');
    expect(open.status, open.stderr).toBe(0);
    const openBuild = open.calls.find(call => call.args.some(arg => arg.endsWith('scripts/uni.mjs')));
    expect(openBuild?.args).toContain('build');
    expect(openBuild?.args).toContain('mp-weixin');
    expect(openBuild?.args).not.toContain('--release');
    const openValidation = open.calls.find(call => call.args.some(arg => arg.endsWith('scripts/validate-wechat-release.mjs')));
    expect(openValidation?.args).toContain('--compile-only');

    for (const command of ['preview', 'upload', 'deploy-cloud']) {
      const result = await runProjectScript(command);
      expect(result.status, result.stderr).toBe(0);
      const build = result.calls.find(call => call.args.some(arg => arg.endsWith('scripts/uni.mjs')));
      expect(build?.args).toContain('--release');
      expect(build?.appId).toBe(appId);
      expect(build?.cloudEnv).toBe(cloudEnv);
      const validation = result.calls.find(call => call.args.some(arg => arg.endsWith('scripts/validate-wechat-release.mjs')));
      expect(validation?.args).not.toContain('--compile-only');
      if (command === 'upload') expect(validation?.args).toEqual(expect.arrayContaining(['--version', '1.1.0']));
      const devtools = result.calls[result.calls.length - 1];
      if (command === 'upload') expect(devtools?.args).toEqual(expect.arrayContaining(['--version', '1.1.0']));
      if (command === 'deploy-cloud') expect(devtools?.args).toEqual(expect.arrayContaining(['--env', cloudEnv]));
    }

    const legacy = await runProjectScript('open', '--legacy');
    expect(legacy.status, legacy.stderr).toBe(0);
    expect(legacy.calls.some(call => call.args.some(arg => arg.endsWith('scripts/build.mjs')))).toBe(true);
    const legacyValidation = legacy.calls.find(call => call.args.some(arg => arg.endsWith('scripts/validate-wechat-release.mjs')));
    expect(legacyValidation?.args).toEqual(expect.arrayContaining(['--target', 'legacy']));

    const explicitRelease = await runProjectScript('open', '--release');
    expect(explicitRelease.status, explicitRelease.stderr).toBe(0);
    expect(explicitRelease.calls[0].args).toContain('--release');

    const illegalBypass = await runProjectScript('preview', '--compile-only');
    expect(illegalBypass.status).not.toBe(0);
    expect(illegalBypass.stderr).toContain('不能跳过');
    expect(illegalBypass.calls).toHaveLength(0);
  });

  it('rejects target, version, app id, cloud and client-packaging mismatches', async () => {
    const wrongTarget = await makeProject({ target: 'legacy' });
    expect(validate(wrongTarget, '--compile-only').status).not.toBe(0);

    const wrongVersion = await makeProject({ versionName: '9.9.9' });
    expect(validate(wrongVersion, '--compile-only').status).not.toBe(0);

    const touristRelease = await makeProject();
    const touristResult = validate(touristRelease);
    expect(touristResult.status).not.toBe(0);
    expect(touristResult.stderr).toContain('禁止 touristappid');

    const cloudUnset = await makeProject({ appId, cloudEnvConfigured: false });
    const cloudResult = validate(cloudUnset);
    expect(cloudResult.status).not.toBe(0);
    expect(cloudResult.stderr).toContain('缺少 WECHAT_CLOUD_ENV');

    const missingIgnores = await makeProject({ ignores: [] });
    const packagingResult = validate(missingIgnores, '--compile-only');
    expect(packagingResult.status).not.toBe(0);
    expect(packagingResult.stderr).toContain('packOptions.ignore');
  });

  it('reports sizes above 1.5 MB before the hard 2 MB limit', async () => {
    const project = await makeProject();
    await writeFile(resolve(project, 'static/large.bin'), Buffer.alloc(Math.floor(1.55 * 1024 * 1024)));
    const result = validate(project, '--compile-only');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('WARN：');
    expect(result.stderr).toContain('1.5 MB');
  });

  it('checks upload/source versions and the 2 MB main-package limit', async () => {
    const project = await makeProject({ appId, cloudEnvConfigured: true });
    const versionResult = validate(project, '--version', '9.9.9');
    expect(versionResult.status).not.toBe(0);
    expect(versionResult.stderr).toContain('版本与当前目标源版本号不一致');

    await writeFile(resolve(project, 'static/oversized.bin'), Buffer.alloc(2 * 1024 * 1024));
    const sizeResult = validate(project, '--compile-only');
    expect(sizeResult.status).not.toBe(0);
    expect(sizeResult.stderr).toContain('必须小于 2 MB');
  });
});
