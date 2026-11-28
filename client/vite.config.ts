import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
      '/api': 'http://localhost:8787',
    },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  // On Render the build knows its repo and commit: the big files (statue models, chants) are then fetched from jsDelivr,
  // the free CDN for public GitHub repos, pinned to this very commit, instead of using up the server's bandwidth.
  // Elsewhere (npm run dev) it's empty and everything comes from our own server.
  define: {
    // which build this is (the deployed commit; '' in development): a tab from an older one reloads itself (see game.ts)
    __BUILD__: JSON.stringify(process.env.RENDER_GIT_COMMIT ?? ''),
    __ASSET_CDN__: JSON.stringify(
      process.env.RENDER_GIT_REPO_SLUG && process.env.RENDER_GIT_COMMIT
        ? `https://cdn.jsdelivr.net/gh/${process.env.RENDER_GIT_REPO_SLUG}@${process.env.RENDER_GIT_COMMIT}/client/public/assets`
        : '',
    ),
  },
});
