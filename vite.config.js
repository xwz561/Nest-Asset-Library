import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const appVersion = String(process.env.NEST_APP_VERSION || pkg.version).trim() || pkg.version;
// 网页采集器（浏览器扩展）的版本号，显示在「扩展」面板里，方便核对浏览器里装的是不是新版
const extensionVersion = JSON.parse(readFileSync(new URL('./browser-extension/manifest.json', import.meta.url), 'utf8')).version;

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __EXTENSION_VERSION__: JSON.stringify(extensionVersion),
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'ui-vendor', test: /node_modules[\\/]@(?:fluentui|griffel)[\\/]/, priority: 20 },
            { name: 'video-vendor', test: /node_modules[\\/]video\.js[\\/]/, priority: 15 },
            { name: 'audio-vendor', test: /node_modules[\\/]wavesurfer\.js[\\/]/, priority: 15 },
            { name: 'vendor', test: /node_modules[\\/](?:react|react-dom|scheduler|lucide-react)[\\/]/, priority: 0 },
          ],
        },
      },
    },
  },
});
