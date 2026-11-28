import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Write dist/build-id so the server can advertise the same id the client was built with. */
function emitBuildId(buildId: string): Plugin {
  return {
    name: 'emit-build-id',
    closeBundle() {
      if (!buildId) return;
      const dir = resolve(__dirname, 'dist');
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, 'build-id'), buildId);
    },
  };
}

export default defineConfig(({ command }) => {
  // Prefer Render's commit; on `vite build` without it, a timestamp so production always has a non-empty id.
  const buildId = process.env.RENDER_GIT_COMMIT || (command === 'build' ? `b${Date.now().toString(36)}` : '');

  return {
    server: {
      port: 5173,
      proxy: {
        '/ws': { target: 'ws://localhost:8787', ws: true },
        '/api': 'http://localhost:8787',
      },
    },
    build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
    plugins: [emitBuildId(buildId)],
    // On Render the build knows its repo and commit: the big files (statue models, chants) are then fetched from jsDelivr,
    // the free CDN for public GitHub repos, pinned to this very commit, instead of using up the server's bandwidth.
    // Elsewhere (npm run dev) it's empty and everything comes from our own server.
    define: {
      // which build this is: a tab from an older one reloads itself (see game.ts); also used as ?v= on asset URLs
      __BUILD__: JSON.stringify(buildId),
      __ASSET_CDN__: JSON.stringify(
        process.env.RENDER_GIT_REPO_SLUG && process.env.RENDER_GIT_COMMIT
          ? `https://cdn.jsdelivr.net/gh/${process.env.RENDER_GIT_REPO_SLUG}@${process.env.RENDER_GIT_COMMIT}/client/public/assets`
          : '',
      ),
    },
  };
});
