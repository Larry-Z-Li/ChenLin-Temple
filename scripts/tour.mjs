#!/usr/bin/env node
/**
 * npm run tour — plays through the temple in a headless Chrome, at desktop and iPhone-portrait size,
 * and saves a screenshot at every stop plus a report (draw calls, triangles, errors) to tour-out/.
 *
 *   npm run dev            (in another terminal; the tour visits http://localhost:5173 by default)
 *   npm run tour           both sizes
 *   npm run tour phone     just one (desktop | phone)
 *
 * Settings: TOUR_URL, TOUR_OUT, CHROME_PATH. It joins as a player called "Tour", so point it at your
 * local server, not the live temple. Draw calls are the number to watch for phones; the frame rate
 * here means nothing (Chrome renders in software when headless).
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const URL = process.env.TOUR_URL ?? 'http://localhost:5173/';
const OUT = path.resolve(process.env.TOUR_OUT ?? 'tour-out');
const SIZES = {
  desktop: { width: 1280, height: 720 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
};
const only = process.argv.slice(2).filter((a) => a in SIZES);

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('No Chrome found. Install Chrome, or set CHROME_PATH to a Chrome/Chromium binary.');
  return found;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await fetch(URL);
} catch {
  console.error(`Nothing is answering at ${URL}. Start the dev server first (npm run dev), or set TOUR_URL.`);
  process.exit(2);
}
fs.rmSync(OUT, { recursive: true, force: true });
const chrome = findChrome();
const results = {};

for (const [size, viewport] of Object.entries(SIZES)) {
  if (only.length && !only.includes(size)) continue;
  const dir = path.join(OUT, size);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    defaultViewport: viewport,
  });
  const page = await browser.newPage();
  // Desktop is pinned to High: software rendering is slow enough that 'auto' would drop to Low mid-tour.
  if (size === 'desktop') await page.evaluateOnNewDocument(() => localStorage.setItem('temple.settings.v1', JSON.stringify({ graphics: 'high' })));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('error', (e) => errors.push(`the tab crashed: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/404|favicon/i.test(m.text()) && errors.push(m.text()));
  const stops = [];
  const run = (fn, arg) => page.evaluate(fn, arg);
  /** Let a couple of frames draw, read the renderer's counts, and save the screen. */
  const snap = async (label) => {
    await run(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const info = await run(() => {
      const r = window.temple?.renderer.info;
      const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : undefined;
      return r ? { draws: r.render.calls, tris: r.render.triangles, textures: r.memory.textures, geometries: r.memory.geometries, heap } : {};
    });
    const file = `${String(stops.length + 1).padStart(2, '0')}-${label}.png`;
    await page.screenshot({ path: path.join(dir, file) });
    stops.push({ label, file, ...info });
    process.stdout.write(`  ${size} · ${label}${info.draws !== undefined ? ` · ${info.draws} draws · ${info.textures} textures · ${info.heap} MB` : ''}\n`);
  };
  /** Stand somewhere, facing `yaw` (0 = north), with the camera behind. */
  const standAt = (x, z, yaw) =>
    run(([x, z, yaw]) => {
      const t = window.temple;
      t.player.pos.set(x, t.ctx.ground.heightAt(x, z), z);
      t.player.yaw = yaw;
      t.rig.setYaw(yaw);
    }, [x, z, yaw]);

  try {
    console.log(`${size} (${viewport.width}×${viewport.height})`);
    await page.goto(URL, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => document.querySelector('.entry-go')?.disabled === false, { timeout: 240_000, polling: 1000 });
    await wait(3000);
    await snap('start-page');

    // Enter, and skip most of the cloud ride down.
    await page.$eval('.entry-panel .text-input', (el) => (el.value = 'Tour'));
    await page.click('.entry-go');
    await page.waitForFunction(() => window.temple.cloud.riding, { timeout: 30_000, polling: 200 });
    await wait(1500);
    await snap('flying');
    await run(() => (window.temple.cloud.t = 1e9));
    await page.waitForFunction(() => !document.body.classList.contains('intro'), { timeout: 30_000, polling: 200 });
    await wait(4000);
    await snap('landed');

    // Every place on the fast-travel map.
    const spots = await run(() => window.temple.travelSpots.map((s) => ({ key: s.key, at: s.at, ...s.arrive })));
    for (const s of spots) {
      await standAt(s.x, s.z, s.yaw);
      await wait(1800);
      await snap(s.key);
    }

    // Inside the first hall, facing the altar; then kneel on a cushion.
    const hall = spots.find((s) => s.key === 'baosheng');
    await standAt(hall.at.x, hall.at.z + 3, 0);
    await wait(1800);
    await snap('inside-baosheng');
    const sat = await run(() => {
      const t = window.temple;
      const s = [...t.ctx.seats.values()].find((s) => s.hallId === 'baosheng' && s.kind === 'cushion');
      if (!s) return false;
      t.player.pos.set(s.x, s.y, s.z + 0.8);
      t.ctx.interactions.update(s.x, s.z + 0.8);
      t.ctx.interactions.trigger();
      return true;
    });
    await wait(2500);
    if (sat) await snap('kneeling');
    await run(() => window.temple.seat.seated && window.temple.seat.stand());
    await wait(1000);

    // The lantern wall's list.
    await run(() => window.temple.hallWishes.openList(0, 0));
    await wait(500);
    await snap('lantern-list');
    await run(() => window.temple.hallWishes.close());

    // The great bell, as when you hang a lantern (no lantern is hung).
    await run(() => window.temple.bodhiBell.ring(window.temple.hallWishes.shotFor(3)));
    // On the bell's own clock (seconds into the scene): headless frames are slow, so wall time drifts.
    for (const [at, label] of [[2.2, 'bell-bodhisattva'], [4.3, 'bell-strike'], [9.4, 'bell-lantern-wall']]) {
      await page.waitForFunction((at) => window.temple.bodhiBell.t >= at, { timeout: 60_000, polling: 100 }, at);
      await snap(label);
    }
    await page.waitForFunction(() => !window.temple.bodhiBell.active, { timeout: 20_000, polling: 300 });

    // The big map, and the plaza at night.
    await page.keyboard.press('KeyM');
    await wait(600);
    await snap('map');
    await page.keyboard.press('Escape');
    const plaza = spots.find((s) => s.key === 'plaza');
    await standAt(plaza.x, plaza.z, plaza.yaw);
    await run(() => window.temple.setDebugHours(21));
    await wait(2500);
    await snap('plaza-night');
  } catch (e) {
    errors.push(`tour stopped: ${e.message}`);
    await page.screenshot({ path: path.join(dir, 'stopped-here.png') }).catch(() => {});
  }
  await browser.close();
  results[size] = { viewport, stops, errors };
}

// Report
const lines = [`# Temple tour`, '', `${new Date().toISOString()} · ${URL}`, ''];
for (const [size, r] of Object.entries(results)) {
  const counted = r.stops.filter((s) => s.draws !== undefined);
  const worst = counted.reduce((a, b) => (b.draws > (a?.draws ?? -1) ? b : a), null);
  lines.push(`## ${size} (${r.viewport.width}×${r.viewport.height})`, '');
  if (worst) lines.push(`Most draw calls: **${worst.draws}** at ${worst.label}.`, '');
  lines.push('| # | stop | draw calls | triangles | textures | geometries | JS heap MB |', '|---|---|---:|---:|---:|---:|---:|');
  r.stops.forEach((s, i) => lines.push(`| ${i + 1} | [${s.label}](${size}/${s.file}) | ${s.draws ?? '–'} | ${s.tris?.toLocaleString('en') ?? '–'} | ${s.textures ?? '–'} | ${s.geometries ?? '–'} | ${s.heap ?? '–'} |`));
  lines.push('', r.errors.length ? `**Errors (${r.errors.length}):**\n\n${r.errors.map((e) => `- ${e}`).join('\n')}` : 'No errors.', '');
}
fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n'));
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));

const failed = Object.values(results).some((r) => r.errors.length);
console.log(`\n${failed ? 'Finished with errors' : 'Finished, no errors'}. Screenshots and report: ${path.relative(process.cwd(), OUT)}/report.md`);
for (const [size, r] of Object.entries(results)) for (const e of r.errors) console.log(`  ${size}: ${e}`);
process.exit(failed ? 1 : 0);
