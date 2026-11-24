import * as THREE from 'three';
import { FLAG_CLOUD, FLAG_INCENSE, FLAG_INCENSE_LIT, FLAG_LISTENING, SNAPSHOT_HZ } from '../../shared/protocol';
import { ChantPanel } from './activities/chantPanel';
import { Mala } from './activities/beads';
import { CloudRide } from './activities/cloudRide';
import { Instruments } from './activities/instruments';
import { buildFloodlights, buildNightLights, LightPool } from './world/lightPool';
import { BodhiBell } from './activities/bodhiBell';
import { HallLanterns } from './activities/hallLanterns';
import { LanternBlessing } from './activities/lanternBlessing';
import { Offerings } from './activities/offerings';
import { SeatSession } from './activities/seatSession';
import { SutraReader } from './activities/sutraReader';
import { Ambient } from './audio/ambient';
import { ChantPlayer } from './audio/chantPlayer';
import { unlockAudio } from './audio/sfx';
import { Soundscape } from './audio/soundscape';
import { buildBenches } from './buildings/benches';
import { buildDecor } from './buildings/decor';
import { buildDecorations } from './buildings/decorations';
import { buildNineSyllables } from './buildings/nineSyllables';
import { buildHall } from './buildings/hall';
import { buildHuts } from './buildings/hut';
import { buildPagodas } from './buildings/pagodas';
import { buildMapBoard } from './buildings/mapBoard';
import { PrayerWheels } from './buildings/prayerWheels';
import { buildStupas } from './buildings/stupas';
import { BASIN, BODHI_TREE, CHERRY_GROVE, HALLS, hallHalf, PLAZA, SPAWN, TRAVEL_SPOTS } from './config/layout';
import { graphicsLevel, isTouchDevice, saveSettings, settings } from './config/settings';
import { loadModelMap, loadThangkas } from './content/manifest';
import { CollisionWorld } from './core/collisions';
import type { WorldContext } from './core/context';
import { Ground } from './core/ground';
import { Input } from './core/input';
import { InteractionSystem } from './core/interaction';
import { onLocaleChange, t } from './i18n';
import { NetClient } from './net/netClient';
import { RemotePlayers } from './net/remotePlayers';
import { CameraRig } from './player/cameraRig';
import { LocalPlayer } from './player/localPlayer';
import { Hud } from './ui/hud';
import { BigMap, Minimap } from './ui/minimap';
import { mountJoystick } from './ui/touch';
import { buildGardens, buildRidgePath } from './world/gardens';
import { Intro } from './world/intro';
import { buildKoi } from './world/koi';
import { buildLanterns } from './world/lanterns';
import { buildLeaves } from './world/leaves';
import { buildPrayerFlags } from './world/prayerFlags';
import { buildSky, setDebugHours, setTempleTimeZone } from './world/sky';
import { buildTerrain } from './world/terrain';
import { farCulled, updateFarCull } from './core/farCull';
import { mergeRigid, mergeStatic } from './core/staticMerge';
import { assignInteriors, interiorLayer, updateInteriors } from './core/interiorCull';
import { buildSandGarden } from './world/sandGarden';
import { buildVegetation } from './world/vegetation';
import { Wildlife } from './world/wildlife';
import { buildPond, buildRiverColliders, buildStream, buildWaterfall } from './world/water';

/**
 * Build the world and start rendering. It opens on the entry screen's intro (your monk pacing on the
 * mountain path); `enter()` connects you and flies him down to the plaza by cloud.
 */
export async function startGame(appEl: HTMLElement, uiEl: HTMLElement) {
  let phase: 'intro' | 'play' = 'intro';
  let landing = false;
  /** Name and robe to join with — held back until the cloud lands at the gate, so nobody sees the walk or the flight. */
  let joinAs: { name: string; color: string } | null = null;
  document.body.classList.add('intro');

  // ---------- Renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  appEl.append(renderer.domElement);

  const scene = new THREE.Scene();
  // Near plane at 0.15 m (the rig keeps 0.3 m from walls and 0.4 m from your head): three times the depth
  // precision of 0.05, so thin layers (rugs, frames, plaques) don't flicker against what they lie on.
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.15, 3000);
  scene.add(camera); // camera children (prayer beads) need to be in the scene graph
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const ctx: WorldContext = {
    scene,
    collisions: new CollisionWorld(),
    ground: new Ground(),
    interactions: new InteractionSystem(),
    cameraBlockers: [],
    seats: new Map(),
    offeringTables: [],
    instruments: [],
    updaters: [],
    detailMeshes: [],
  };

  // ---------- World ----------
  const sky = buildSky(scene, renderer);
  buildTerrain(scene);
  const [models, thangkas] = await Promise.all([loadModelMap(), loadThangkas()]);
  // Builders whose output never moves (apart from parts flagged userData.dynamic): merged into big meshes later.
  const staticRoots: THREE.Object3D[] = [];
  const staticBuild = <T>(fn: () => T): T => {
    const before = new Set(scene.children);
    const r = fn();
    for (const c of scene.children) if (!before.has(c)) staticRoots.push(c);
    return r;
  };
  staticBuild(() => buildDecor(ctx));
  staticBuild(() => buildBenches(ctx));
  staticBuild(() => HALLS.forEach((def) => buildHall(ctx, def, models, thangkas)));
  buildPond(ctx);
  buildWaterfall(ctx);
  buildStream(ctx);
  buildRiverColliders(ctx);
  const stupas = buildStupas(ctx);
  buildPrayerFlags(ctx, stupas);
  staticBuild(() => buildDecorations(ctx, stupas));
  staticBuild(() => buildLanterns(ctx));
  staticBuild(() => buildGardens(ctx, models));
  const ridge = staticBuild(() => buildRidgePath(ctx));
  staticBuild(() => buildPagodas(ctx));
  staticBuild(() => buildHuts(ctx));
  staticBuild(() => buildSandGarden(ctx));
  buildKoi(ctx);
  buildLeaves(ctx, camera);
  const { orchard } = buildVegetation(ctx);

  // Real lights for the hall interiors nearest you (8, or 4 on low graphics); outdoor lamps use the night light map. See lightPool.
  const lights = new LightPool(scene, 8);

  // High / low graphics: pixel ratio, shadows, grass & flowers, how many lamps really light.
  // On high the resolution adapts (see measure): sharpness gives way first, before shadows or lights.
  const SCALES = [2, 1.75, 1.5, 1.25, 1];
  let scaleStep = 0;
  const pixelRatio = () => Math.min(window.devicePixelRatio, graphicsLevel() === 'low' ? 1 : SCALES[scaleStep]);
  const applyGraphics = () => {
    const low = graphicsLevel() === 'low';
    lights.setActive(low ? 4 : 8);
    renderer.setPixelRatio(pixelRatio());
    renderer.shadowMap.enabled = !low;
    sky.sun.castShadow = !low;
    for (const m of ctx.detailMeshes) m.visible = !low;
    scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => (m.needsUpdate = true));
    });
  };
  applyGraphics();

  // ---------- Systems ----------
  const input = new Input();
  const net = new NetClient();
  const player = new LocalPlayer(settings.color, settings.name);
  player.pos.y = ctx.ground.heightAt(player.pos.x, player.pos.z);
  scene.add(player.avatar.root);
  const rig = new CameraRig(camera, renderer.domElement);
  const remotes = new RemotePlayers(scene, (x, z) => ctx.ground.heightAt(x, z));

  const ambient = new Ambient();
  const chants = new ChantPlayer();
  // Birdsong comes from the orchard, the Bodhi tree, the cherry avenue and the forest edge.
  const birdPoints = [
    ...orchard.trees.map((t) => new THREE.Vector3(t.x, 3, t.z)),
    new THREE.Vector3(BODHI_TREE.x, 6, BODHI_TREE.z),
    ...[PLAZA.z - 10, PLAZA.z + 2].flatMap((z) => [new THREE.Vector3(-16, 4, z), new THREE.Vector3(16, 4, z)]),
    new THREE.Vector3(CHERRY_GROVE.x, 4, CHERRY_GROVE.z),
    ...Array.from({ length: 28 }, (_, i) => new THREE.Vector3(BASIN.x + Math.sin(i * 0.2244) * (BASIN.radius - 6), 5, BASIN.z + Math.cos(i * 0.2244) * (BASIN.radius - 6))),
  ];
  const soundscape = new Soundscape(birdPoints);

  const bigMap = new BigMap(uiEl);
  const minimap = new Minimap(uiEl, () => bigMap.toggle());
  /** No flying from inside a hall: step outside first. */
  const insideHall = () => HALLS.some((h) => {
    const [ex, ez] = hallHalf(h);
    return Math.abs(player.pos.x - h.x) < ex && Math.abs(player.pos.z - h.z) < ez;
  });
  buildMapBoard(ctx, () => bigMap.show(true));
  if (/[?&]fps\b/.test(location.search)) settings.showFps = true; // ?fps in the address: show the counter this visit
  const hud: Hud = new Hud(uiEl, {
    onMusic: (on) => ambient.setOn(on),
    onSeatAction: (a) => seat.action(a),
    onStandAction: (a) => phase === 'play' && !landing && !cloud.riding && !bodhiBell.active && seat.standAction(a),
    onChants: () => chantPanel.show(!chantPanel.isOpen),
    onFastTravel: () => (insideHall() ? hud.toast(t('travel.inside')) : (seat.endStanding(), bigMap.toggle(true))),
    onMap: () => bigMap.toggle(),
    onPrompt: () => !seat.seated && ctx.interactions.trigger(),
    onBow: () => bow(),
    onBeadStep: (dir) => mala.step(dir),
    onGraphics: () => applyGraphics(),
  });
  onLocaleChange(() => hud.refreshText());
  // Start page: how many are in the temple right now (you only join once you land at the gate).
  const inIntro = () => document.body.classList.contains('intro');
  let headcount: { present: number; max: number } | null = null;
  const headcountListeners = new Set<(present: number, max: number) => void>();
  const pollHeadcount = () =>
    fetch('/api/status')
      .then((r) => r.json())
      .then((s: { present: number; max?: number }) => {
        if (!inIntro()) return;
        hud.setStatus('online', s.present);
        headcount = { present: s.present, max: s.max ?? Infinity };
        headcountListeners.forEach((fn) => fn(headcount!.present, headcount!.max));
      })
      .catch(() => {});
  void pollHeadcount();
  const headcountTimer = setInterval(() => (inIntro() ? void pollHeadcount() : clearInterval(headcountTimer)), 10000);
  // Someone took the last place as we landed: practise alone for now (the client keeps retrying), and say so once.
  let toldFull = false;
  net.on('full', () => (toldFull ? undefined : ((toldFull = true), hud.toast(t('net.full')))));
  void ambient.init().then(() => hud.renderMusic(ambient.available));
  void chants.init();
  void soundscape.init();
  const sutra = new SutraReader(uiEl);
  const chantPanel = new ChantPanel(uiEl, chants);
  chants.onChange(() => hud.setChantPlaying(chants.playing)); // the 梵唄 buttons light up while one plays
  const mala = new Mala(camera);
  if (isTouchDevice) mountJoystick(uiEl, input);

  // Prayer wheels: tap E beside one to push it. Local pushes apply instantly; the server
  // echoes everyone's pushes with the authoritative speed.
  const wheels = new PrayerWheels(ctx, (w) => net.pushWheel(w.id));
  net.on('push', (id, _by, speed) => wheels.setSpeed(id, speed));
  net.on('welcome', (msg) => {
    for (const id in msg.wheels) wheels.setSpeed(id, msg.wheels[id], true);
  });

  const seat: SeatSession = new SeatSession({ ctx, net, player, rig, hud, mala, sutra });
  const offerings = new Offerings(ctx, net, hud, orchard, player);
  const cloud = new CloudRide(ctx, player, rig, hud);
  bigMap.onTravel = (spot) => {
    if (insideHall()) return hud.toast(t('travel.inside'));
    if (seat.seated || player.mode !== 'free') return hud.toast(t('travel.standUp'));
    cloud.flyTo(spot.arrive);
  };
  const wildlife = new Wildlife(ctx, net, offerings, player, () => remotes.positions()); // registers the cat before the instruments pick it up
  const instruments = new Instruments(ctx, net, player);
  // A lantern wall (光明燈) in every hall (not the open shrines).
  const blessing = new LanternBlessing(ctx, net, player, hud);
  const lanternWalls = staticBuild(() => HALLS.filter((h) => h.kind === 'hall').map((h) => new HallLanterns(ctx, net, hud, player, uiEl, settings.name, h.id, blessing)));
  blessing.onHeld = (id) => lanternWalls.forEach((w) => w.heldChanged(id));
  blessing.onCount = (id, n) => lanternWalls.forEach((w) => w.counted(id, n));
  const lanternColour = (id: string) => lanternWalls.map((w) => w.colourOf(id)).find((c) => c !== null) ?? null;
  remotes.lanternOf = (pid) => blessing.colourHeldBy(pid, lanternColour);
  const hallWishes = lanternWalls.find((w) => w.hallId === 'baosheng')!;
  const bodhiBell = staticBuild(() => new BodhiBell(ctx));
  for (const w of lanternWalls) w.onHung = (shot) => bodhiBell.ring(shot);
  buildNightLights(); // every lamp is registered by now
  buildFloodlights(ctx);
  // Thousands of small static meshes → a few hundred (draw calls are what phones struggle with).
  // `?nomerge` in the address skips it (to tell a merging problem from a modelling one).
  const noMerge = /[?&]nomerge\b/.test(location.search);
  const merged = noMerge ? { before: 0, after: 0 } : mergeStatic(scene, staticRoots, { skip: new Set(ctx.detailMeshes), keepForRaycast: new Set(ctx.cameraBlockers), zone: interiorLayer });
  let rigid = 0;
  if (!noMerge) scene.traverse((o) => o.userData.rigid && (rigid += mergeRigid(o)));
  const inside = assignInteriors(scene, new Set(farCulled()));
  if (import.meta.env.DEV) console.info(`[static merge] ${merged.before} meshes → ${merged.after}; ${rigid} fewer in moving things; ${inside} inside halls`);
  const bow = (): void => (seat.seated || seat.standingFocus ? seat.bow() : player.gesture("bow", 2.4));

  // Networking
  net.on('status', (s) => hud.setStatus(s, remotes.count + 1));
  net.on('welcome', (msg) => {
    setTempleTimeZone(msg.tz);
    remotes.reset(msg.players);
    hud.setStatus('online', remotes.count + 1);
  });
  net.on('join', (p) => {
    remotes.add(p);
    hud.setStatus(net.status, remotes.count + 1);
  });
  net.on('leave', (id) => {
    remotes.remove(id);
    hud.setStatus(net.status, remotes.count + 1);
  });
  net.on('snap', (tr) => remotes.applySnapshot(tr));

  // Global keys (lowest priority — the seat handler, registered after, gets first pick while seated)
  input.onKey((e) => {
    if (phase !== 'play' || landing || bodhiBell.active) return false; // the entry screen, the flight down, the bell
    if (e.code === 'KeyE') {
      if (!e.repeat) ctx.interactions.trigger(); // each tap counts; holding doesn't auto-push
      return true;
    }
    if (e.code === 'KeyB') return !e.repeat && bow(), true;
    // Standing: 2 beads, 3 sutra (seated, the seat bar handles the number keys).
    if (!seat.seated && (e.code === 'Digit2' || e.code === 'Digit3')) return !e.repeat && seat.standAction(e.code === 'Digit2' ? 'beads' : 'sutra'), true;
    // Dev preview only: F toggles flying (never in the live build).
    if (import.meta.env.DEV && e.code === 'KeyF' && !e.repeat && !seat.seated && !cloud.riding) {
      player.flying = !player.flying;
      if (!player.flying) player.pos.y = ctx.ground.heightAt(player.pos.x, player.pos.z);
      hud.toast(player.flying ? 'Flying (dev): WASD · Space up · Q down · Shift fast · F to land' : 'Landed');
      return true;
    }
    if (e.code === 'KeyM') return bigMap.toggle(), true;
    if (e.code === 'Escape' && bigMap.isOpen) return bigMap.show(false), true;
    if (e.code === 'Escape' && blessing.active) return blessing.cancel(), true;
    const openWall = lanternWalls.find((w) => w.isOpen);
    if (e.code === 'Escape' && openWall) return openWall.close(), true;
    if (e.code === 'KeyC') return chantPanel.show(!chantPanel.isOpen), true; // listening works anywhere
    if (e.code === 'Escape' && chantPanel.isOpen) return chantPanel.show(false), true;
    if (e.code === 'Escape' && hud.settingsOpen) return hud.toggleSettings(false), true;
    if (e.code === 'Escape' && hud.helpOpen) return hud.toggleHelp(false), true;
    return false;
  });
  input.onKey((e) => seat.handleKey(e));

  // ---------- Loop ----------
  const clock = new THREE.Clock();
  let sendAcc = 0, mapAcc = 0, lastSent = '';
  const intro = new Intro(ctx, camera, player, ridge);
  const lookDir = new THREE.Vector3();
  let landYaw = SPAWN.yaw;

  // Frame rate: the optional counter, and 'auto' graphics stepping down to low (and remembering it)
  // when this device can't keep up on high. Measured twice a second; a hidden tab doesn't count.
  let fpsFrames = 0, fpsT = performance.now(), slowFor = 0, playedFor = 0, sagFor = 0, easyFor = 0, easyNeed = 10;
  const measure = () => {
    fpsFrames++;
    const now = performance.now(), span = (now - fpsT) / 1000;
    if (span < 0.5) return;
    const fps = fpsFrames / span;
    fpsFrames = 0;
    fpsT = now;
    hud.setFps(fps, renderer.info.render.calls);
    // High graphics: drop the render resolution a step when the frame rate sags, raise it again when
    // there's room. Only once it's at 1× does 'auto' fall back to low graphics.
    if (span <= 2 && graphicsLevel() === 'high') {
      sagFor = fps < 42 ? sagFor + span : 0;
      easyFor = fps > 57 ? easyFor + span : 0;
      const step = sagFor >= 1.5 && pixelRatio() > 1 ? 1 : easyFor >= easyNeed && scaleStep > 0 ? -1 : 0;
      if (step) {
        scaleStep += step;
        renderer.setPixelRatio(pixelRatio());
        sagFor = easyFor = 0;
        if (step > 0) easyNeed = Math.min(120, easyNeed * 2); // stepped up too soon: wait longer next time
        if (step > 0) return void (slowFor = 0);
      }
      if (pixelRatio() > 1) return void (slowFor = 0);
    }
    if (span > 2 || phase !== 'play' || playedFor < 8 || settings.graphics !== 'auto' || graphicsLevel() === 'low') return void (slowFor = 0);
    slowFor = fps < 40 ? slowFor + span : Math.max(0, slowFor - span);
    if (slowFor < 6) return;
    settings.autoLow = true;
    saveSettings();
    applyGraphics();
    hud.renderGraphics();
    hud.toast(t('settings.autoLow'));
  };
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;

    if (phase === 'intro') {
      intro.update(dt);
      lights.update(dt, player.pos);
      for (const u of ctx.updaters) u(dt, time);
      remotes.update(dt, camera);
      sky.update(dt);
      sky.follow(player.pos, camera.getWorldDirection(lookDir));
      bigMap.draw(player.pos, player.yaw, remotes.positions()); // the start page's map button
      updateInteriors(camera, graphicsLevel() === 'low' ? 1 : 2);
      renderer.render(scene, camera);
      measure();
      return;
    }
    if (landing && !cloud.riding) {
      landing = false;
      document.body.classList.remove('intro'); // landed: show the HUD
      rig.lookAlong(landYaw, 0.3, 6); // one slow pan round to face the temple (or the hall) — only after the start trip
      join();
      if (chants.index < 0) chants.play(0); // landed: the first chant, on repeat
    }

    cloud.update(dt);
    lights.update(dt, player.pos);
    updateFarCull(dt, camera.position, graphicsLevel() === 'low' ? 1 : 2);
    updateInteriors(camera, graphicsLevel() === 'low' ? 1 : 2);
    if (!bodhiBell.active) player.update(dt, input, rig.yaw, ctx.collisions, ctx.ground); // stand still while the bell rings

    document.body.classList.toggle('cinematic', bodhiBell.active); // the bell's camera: bottom buttons out of the way
    if (bodhiBell.active) hud.setPrompt(null);
    else if (!seat.seated && !cloud.riding && !offerings.busy && !blessing.active) {
      const it = ctx.interactions.update(player.pos.x, player.pos.z);
      const p = it?.prompt();
      hud.setPrompt(p?.text ?? null, p?.busy);
    }

    wheels.update(dt);
    offerings.update(dt);
    blessing.update(dt);
    remotes.update(dt, camera);
    for (const u of ctx.updaters) u(dt, time);
    seat.update(dt);
    const duck = chants.playing ? 0.3 : 1; // lower ambience under chants
    ambient.duck = soundscape.duck = duck;
    player.avatar.setListening(chants.playing);
    player.avatar.setIncense(offerings.incense);
    mala.update(dt);
    ambient.update(dt);
    chants.update(dt);
    soundscape.update(dt, player.pos, rig.yaw, player.mode === 'free' ? player.speed : 0);

    rig.update(dt, player.pos, seat.seated ? 1.0 : 1.55, ctx.cameraBlockers, ctx.ground);
    bodhiBell.applyCamera(camera);
    sky.update(dt);
    sky.follow(player.pos, camera.getWorldDirection(lookDir));

    sendAcc += dt;
    if (sendAcc >= 1 / SNAPSHOT_HZ) {
      sendAcc = 0;
      const flags = (chants.playing ? FLAG_LISTENING : 0) | (offerings.incense ? FLAG_INCENSE : 0) | (offerings.incense === 2 ? FLAG_INCENSE_LIT : 0) | (cloud.riding ? FLAG_CLOUD : 0) | blessing.flags;
      const tr = player.transform(flags), key = tr.join(',');
      if (key !== lastSent) {
        net.sendMove(tr);
        lastSent = key;
      }
    }
    mapAcc += dt;
    if (mapAcc > 0.1) {
      mapAcc = 0;
      minimap.draw(player.pos, player.yaw, remotes.positions());
      bigMap.draw(player.pos, player.yaw, remotes.positions());
    }
    renderer.render(scene, camera);
    playedFor += dt;
    measure();
  });

  /** Go online (others start seeing you) — only once you're standing at the gate. */
  function join() {
    if (!joinAs) return;
    net.connect(joinAs.name, joinAs.color);
    joinAs = null;
    lastSent = ''; // send where we are straight away
  }

  // Debug handle for the console during development.
  // For poking at from the console, and for `npm run tour` (scripts/tour.mjs).
  // 九字: on the gate halls' roofs, and 前 under the great incense burner
  void buildNineSyllables(scene, (x, z) => ctx.ground.heightAt(x, z));
  (window as unknown as Record<string, unknown>).temple = { scene, player, ctx, net, seat, rig, wheels, chants, remotes, offerings, mala, cloud, instruments, wildlife, hallWishes, lights, bodhiBell, renderer, setDebugHours, intro, hud, bigMap, travelSpots: TRAVEL_SPOTS, lanternBlessing: blessing };

  return {
    /** The start page's headcount, now and as it changes (with the temple's limit). */
    onHeadcount(fn: (present: number, max: number) => void) {
      headcountListeners.add(fn);
      if (headcount) fn(headcount.present, headcount.max);
    },
    /** The entry screen's robe picker: recolour the pacing monk. */
    preview: (color: string) => player.avatar.setColor(color),
    /** The click that enters: ready the first chant (六字大明咒) to play when you land (see `landed`). */
    startChant: () => chants.prime(0),
    /** Enter: fly the monk down from the mountain to the gate (or a hall) by cloud, then go online. */
    enter(name: string, color: string, hallId?: string) {
      unlockAudio();
      ambient.setOn(settings.musicOn);
      player.avatar.setColor(color);
      player.avatar.clasp = false;
      player.avatar.root.name = name;
      for (const w of lanternWalls) w.myName = name;
      joinAs = { name, color };
      phase = 'play';
      landing = true;
      // Keep facing the way the start screen looked (out over the valley); the flight doesn't turn the view.
      const f = camera.getWorldDirection(new THREE.Vector3());
      rig.setYaw(Math.atan2(-f.x, -f.z));
      // the front gate, or (from the start menu's hall buttons) straight to a hall's door
      const dest = TRAVEL_SPOTS.find((s) => s.key === hallId)?.arrive ?? { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw };
      landYaw = dest.yaw;
      if (!cloud.flyTo(dest)) {
        player.pos.set(dest.x, ctx.ground.heightAt(dest.x, dest.z), dest.z);
        landing = false;
        document.body.classList.remove('intro');
        join();
        if (chants.index < 0) chants.play(0);
      }
    },
  };
}
