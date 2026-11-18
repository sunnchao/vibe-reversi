import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { mergeConfig } from 'vite';
import baseConfig from '../vite.config';
import { assertWechatConfig, wechatVersion } from './wechat-release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cloudEntry = resolve(root, 'cloudfunctions/reversiRoom/index.ts');
const cloudPackage = resolve(root, 'cloudfunctions/reversiRoom/package.json');

// Keep the shared Vite configuration and its H5 friend-room middleware intact.
// Emit deployment files as Rollup assets so both builds and watch rebuilds finish
// with matching client and server rules, without changing the source manifest.
export default mergeConfig(baseConfig, {
  plugins: [{
    name: 'uniapp-wechat-delivery',
    apply: 'build',
    enforce: 'post',
    buildStart() {
      this.addWatchFile(cloudEntry);
      this.addWatchFile(cloudPackage);
      this.addWatchFile(resolve(root, 'uniapp/manifest.json'));
    },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        const output = process.env.UNI_OUTPUT_DIR;
        const projectAsset = bundle['project.config.json'];
        // uni-app emits project.config.json only when the manifest changes.
        const projectSource = projectAsset?.type === 'asset'
          ? projectAsset.source
          : await readFile(resolve(output, 'project.config.json'), 'utf8');
        const project = JSON.parse(typeof projectSource === 'string'
          ? projectSource : Buffer.from(projectSource).toString('utf8'));
        assertWechatConfig(process.env, process.env.WECHAT_RELEASE === '1');
        project.appid = process.env.WECHAT_APPID?.trim() || 'touristappid';
        project.packOptions ??= {};
        project.packOptions.ignore ??= [];
        for (const item of [
          { type: 'folder', value: 'cloudfunctions' },
          { type: 'file', value: 'build-info.json' },
        ]) {
          if (!project.packOptions.ignore.some(ignore => ignore.type === item.type && ignore.value === item.value)) {
            project.packOptions.ignore.push(item);
          }
        }
        const source = `${JSON.stringify(project, null, 2)}\n`;
        if (projectAsset?.type === 'asset') projectAsset.source = source;
        else this.emitFile({ type: 'asset', fileName: 'project.config.json', source });
        this.emitFile({
          type: 'asset', fileName: 'build-info.json',
          source: `${JSON.stringify({
            target: 'uniapp',
            appId: project.appid,
            cloudEnvConfigured: Boolean(process.env.WECHAT_CLOUD_ENV?.trim()),
            versionName: wechatVersion(root, 'uniapp'),
            builtAt: new Date().toISOString(),
          }, null, 2)}\n`,
        });

        // Build the TS entry directly; the legacy index.js may be out of date.
        const result = await build({
          absWorkingDir: root,
          entryPoints: [cloudEntry],
          outfile: resolve(output, 'cloudfunctions/reversiRoom/index.js'),
          bundle: true,
          platform: 'node',
          target: 'node18',
          format: 'cjs',
          external: ['wx-server-sdk'],
          write: false,
          metafile: true,
          logLevel: 'silent',
        });
        for (const input of Object.keys(result.metafile.inputs)) this.addWatchFile(resolve(root, input));
        this.emitFile({
          type: 'asset', fileName: 'cloudfunctions/reversiRoom/index.js',
          source: result.outputFiles[0].contents,
        });
        this.emitFile({
          type: 'asset', fileName: 'cloudfunctions/reversiRoom/package.json',
          source: await readFile(cloudPackage, 'utf8'),
        });
      },
    },
    writeBundle() {
      console.log(`[uni-app] 微信工程及 reversiRoom 云函数已生成：${relative(root, process.env.UNI_OUTPUT_DIR)}/；请导入微信开发者工具，云函数尚未部署。`);
    },
  }],
});
