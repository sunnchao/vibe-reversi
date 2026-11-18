import { defineConfig } from 'vite';
import uniModule from '@dcloudio/vite-plugin-uni';
import { friendsPreviewMiddleware } from './scripts/friends-preview';

const uni = (uniModule as unknown as { default?: typeof uniModule }).default ?? uniModule;
export default defineConfig({
  plugins: [{
    name: 'friends-preview-service',
    configureServer(server) { server.middlewares.use(friendsPreviewMiddleware()); },
    configurePreviewServer(server) { server.middlewares.use(friendsPreviewMiddleware()); },
  }, uni()],
  preview: { host: '0.0.0.0', port: 4175, strictPort: true },
  define: { __WECHAT_CLOUD_ENV__: JSON.stringify(process.env.WECHAT_CLOUD_ENV || '') },
  server: { strictPort: true },
});
