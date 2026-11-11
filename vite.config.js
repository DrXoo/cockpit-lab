import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The MIT license requires shipping the notice with the code, and the minifier strips the
// @license header, so the bundled dependencies' license files are emitted next to the build.
const BUNDLED_LICENSES = { three: 'node_modules/three/LICENSE' };

function bundledLicenses() {
  return {
    name: 'bundled-licenses',
    generateBundle() {
      for (const [name, path] of Object.entries(BUNDLED_LICENSES)) {
        this.emitFile({
          type: 'asset',
          fileName: `licenses/${name}.txt`,
          source: readFileSync(new URL(path, import.meta.url), 'utf8'),
        });
      }
    },
  };
}

export default defineConfig({
  root: 'src',
  // Relative asset paths, so the build works from any folder of a static file server.
  base: './',
  plugins: [bundledLicenses()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Three.js alone is about 700 kB minified; code splitting can come once there is a reason.
    chunkSizeWarningLimit: 800,
  },
});
