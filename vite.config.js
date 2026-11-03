import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const appVersion = String(process.env.NEST_APP_VERSION || pkg.version).trim() || pkg.version;

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
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
