import * as THREE from 'three';
import { SKY_PX } from './world/skyChart';
import { FLAG_CIRCLE, FLAG_CLOUD, FLAG_INCENSE, FLAG_INCENSE_LIT, FLAG_LISTENING, FLAG_TRAIL_SHIFT, FLAG_WHEEL, SNAPSHOT_HZ, WHEEL_MAX } from '../../shared/protocol';
import { Circumambulation } from './activities/circumambulation';
import { CircleWalk } from './activities/circleWalk';
import { LightTrail } from './world/lightTrail';
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
import { GreatWheels } from './buildings/greatWheel';
import { buildStupas } from './buildings/stupas';
import { BASIN, BODHI_TREE, CHERRY_GROVE, GREAT_STUPA, HALLS, hallHalf, PAGODAS, PLAZA, SPAWN, TRAVEL_SPOTS } from './config/layout';
import { beginHighProbe, endHighProbe, graphicsLevel, isTouchDevice, saveSettings, setSessionGraphics, settings } from './config/settings';
import { loadModelMap, loadThangkas } from './content/manifest';
import { buildModelGallery } from './world/modelGallery';
import { buildCourtLights } from './world/courtLights';
import { buildFlagRing } from './world/flagRing';
import { GarudaFlags } from './activities/garudaFlags';
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
import { cullFar, farCulled, updateFarCull } from './core/farCull';
import { mergeRigid, mergeStatic } from './core/staticMerge';
import { assignInteriors, hallAt, interiorLayer, isGlow, updateInteriors } from './core/interiorCull';
import { buildSandGarden } from './world/sandGarden';
import { buildVegetation } from './world/vegetation';
import { Wildlife } from './world/wildlife';
import { buildPond, buildRiverColliders, buildStream } from './world/water';
import { buildCaveFallsWorld } from './world/caveFallsWorld';
import { buildRocks } from './world/rocks';

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
  // (phones: no multisampling, a plainer shadow filter; their dense screens hide the edges, and their GPUs need the time)
  const renderer = new THREE.WebGLRenderer({ antialias: !isTouchDevice, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.type = isTouchDevice ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  appEl.append(renderer.domElement);

  const scene = new THREE.Scene();
  // Near plane at 0.15 m (the rig keeps 0.3 m from walls and 0.4 m from your head): three times the depth
  // precision of 0.05, so thin layers (rugs, frames, plaques) don't flicker against what they lie on.
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.15, 3000);
  // (the start screen looks at everything from far off: a farther near plane there, for the depth to be sharp enough
  // that the halls' foundations don't flicker against the ground; back to 0.15 m once you're in)
  camera.near = 1.5;
  camera.updateProjectionMatrix();
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
  buildCaveFallsWorld(ctx);
  buildStream(ctx);
  buildRiverColliders(ctx);
  const stupas = buildStupas(ctx);
  buildPrayerFlags(ctx, stupas);
  const flagRing = buildFlagRing(ctx); // (the ring of lines round the temples Garuda hangs flags on)
  staticBuild(() => buildDecorations(ctx, stupas));
  staticBuild(() => buildLanterns(ctx));
  staticBuild(() => buildGardens(ctx, models));
  buildCourtLights(ctx); // (the stupa court's ground lights: on its paving, which the gardens lay)
  const ridge = staticBuild(() => buildRidgePath(ctx));
  staticBuild(() => buildPagodas(ctx));
  staticBuild(() => buildHuts(ctx));
  staticBuild(() => buildSandGarden(ctx));
  buildKoi(ctx);
  buildLeaves(ctx, camera);
  const { orchard } = buildVegetation(ctx);
  buildRocks(ctx); // boulders and outcrops over the mountainsides

  // Real lights for the hall interiors nearest you (8, or 4 on low graphics); outdoor lamps use the night light map. See lightPool.
  const lights = new LightPool(scene, 8);

  // High / low graphics: pixel ratio, shadows, grass & flowers, how many lamps really light.
  // On high the resolution adapts (see measure): sharpness gives way first, before shadows or lights.
  const SCALES = [2, 1.75, 1.5, 1.25, 1];
  // (phones, on low graphics, start at 1.5× and find their own level like everyone else: no longer stuck at a soft 1×)
  let scaleStep = isTouchDevice ? 2 : 0;
  const pixelRatio = () => Math.min(window.devicePixelRatio, SCALES[scaleStep]);
  const applyGraphics = () => {
    const low = graphicsLevel() === 'low';
    lights.setActive(low || isTouchDevice ? 4 : 8); // (every real light is paid for in every lit pixel: phones get 4)
    renderer.setPixelRatio(pixelRatio()), (SKY_PX.value = renderer.getPixelRatio());
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
    onStandAction: (a) => phase === 'play' && !circle.active && !landing && !cloud.riding && !bodhiBell.active && seat.standAction(a),
    onChants: () => chantPanel.show(!chantPanel.isOpen),
    onFastTravel: () => (insideHall() ? hud.toast(t('travel.inside')) : (circle.stop(), seat.endStanding(), bigMap.toggle(true))),
    onMap: () => bigMap.toggle(),
    onPrompt: () => (circle.active ? circle.pressE() : gw.controlling ? gw.pressE() : !seat.seated && useInteraction()),
    onWheelOff: () => (circle.active ? circle.stop() : gw.getOff()),
    onCircle: () => startCircle(),
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
      .then((s: { present: number; max?: number; full?: boolean }) => {
        if (!inIntro()) return;
        hud.setStatus('online', s.present);
        headcount = { present: s.present, max: s.full ? s.present : s.max ?? Infinity }; // (full counts every connection, not just those placed)
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
  const wheels = staticBuild(() => new PrayerWheels(ctx, (w) => net.pushWheel(w.id))); // (their galleries and pavilions merged with the rest; the drums turn)
  /** Use what's at hand (E, or a tap on the prompt); a prayer wheel's gold button bounces with each push. */
  const useInteraction = (key?: string) => {
    const id = ctx.interactions.current?.id;
    if (ctx.interactions.trigger(key) && id?.startsWith('wheel-')) hud.bumpMash();
  };
  // The great prayer wheel (大轉經輪): queue at a stair, ride an opening round, E to get off. The server turns it.
  const gw = new GreatWheels(ctx, net, player, rig);
  gw.onPress = () => hud.bumpMash(); // (the mash button bounces with each press)
  const garudaFlags = new GarudaFlags(ctx, net, player, hud, flagRing);
  garudaFlags.onHung = () => addMerit(10);
  net.on('welcome', (msg) => msg.flags?.forEach(([line, slot, color]) => flagRing.hang(line, slot, color)));
  // an update announced to everyone: a banner up top, counting down (a fresh server, after it, has none)
  net.on('notice', (_kind, inMs) => hud.setUpdateNotice(inMs));
  net.on('welcome', (msg) => hud.setUpdateNotice(msg.notice?.in ?? null));
  // a newer build on the server than this tab: reload into it (an old tab would see, and show others, a world that's moved on)
  net.on('welcome', (msg) => { if (__BUILD__ && msg.build && msg.build !== __BUILD__) hud.reloadForUpdate(); });
  net.on('outdated', () => hud.reloadForUpdate());
  gw.onSpin = () => addMerit(10); // 功德 for every full turn of the great wheel you help turn
  net.on('push', (id, by, speed) => wheels.setSpeed(id, speed, false, by === net.id ? 'self' : by)); // whoever pushed last owns its turns
  // 功德: 1 for every 5 turns of a wheel you set going; incense 10, a fruit offered 1, a deer fed 1,
  // a great prostration (大禮拜) 10, hanging a lantern 100, praying for one 20
  hud.setMerit(settings.merit);
  const addMerit = (n: number) => {
    settings.merit += n;
    saveSettings();
    hud.meritPop(n, settings.merit); // "+n" floats over to the 功德 drawer
  };
  let wheelTurns = 0;
  // 繞塔: each clockwise lap of the stupa circled on autopilot (press Q there), 20 and, from the first on, a trail of
  // light; laps walked on foot count for nothing
  const circ = new Circumambulation();
  circ.onLap = (n) => {
    addMerit(20);
    hud.toast(t('circ.lap', { n }));
  };
  const myTrail = new LightTrail(scene);
  wheels.onTurn = (spinner, turns) => {
    if (spinner !== 'self') return;
    wheelTurns += turns;
    if (wheelTurns < 5) return;
    const n = Math.floor(wheelTurns / 5);
    wheelTurns -= n * 5;
    addMerit(n);
  };
  net.on('welcome', (msg) => {
    for (const id in msg.wheels) wheels.setSpeed(id, msg.wheels[id], true);
  });

  const seat: SeatSession = new SeatSession({ ctx, net, player, rig, hud, mala, sutra });
  // 大禮拜 earns 功德 only toward the holy: facing (within 30°) a buddha's or bodhisattva's statue in the hall you're in,
  // or out of doors within a little way of one, of the great stupa or of a pagoda
  let holy: { x: number; z: number; hall: number; reach: number }[] | null = null;
  const facingHoly = () => {
    if (!holy) {
      holy = [];
      const v = new THREE.Vector3();
      scene.traverse((o) => { if (o.name.startsWith('statue-')) { o.getWorldPosition(v); holy!.push({ x: v.x, z: v.z, hall: hallAt(v.x, v.z), reach: 18 }); } });
      holy.push({ x: GREAT_STUPA.x, z: GREAT_STUPA.z, hall: 0, reach: 40 });
      for (const pg of PAGODAS) holy.push({ x: pg.x, z: pg.z, hall: 0, reach: 22 });
    }
    const p = player.pos, fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), here = hallAt(p.x, p.z);
    return holy.some((h) => {
      const dx = h.x - p.x, dz = h.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.3 || (h.hall ? h.hall !== here : d > h.reach)) return false;
      return (dx * fx + dz * fz) / d > Math.cos(Math.PI / 6);
    });
  };
  seat.onProstration = () => { if (facingHoly()) addMerit(5); }; // +5 for each one toward the holy (and no word otherwise)
  gw.onJoin = () => seat.endStanding(); // on the great wheel, everything is put away
  // 繞塔 on autopilot (Q in the court; E mashes for pace; Q again or walking by hand ends it)
  const circle = new CircleWalk(ctx, player, rig, () => remotes.circlers());
  circle.onStart = () => seat.endStanding();
  circle.onPress = () => hud.bumpMash();
  const startCircle = () => {
    if (phase !== 'play' || landing || bodhiBell.active || cloud.riding || gw.controlling || seat.seated || offerings.busy || blessing.active) return;
    circle.canStart && circle.start();
  };
  sutra.onClose = () => seat.setFocus('sutra'); // the reader's ✕: put the sutra away (seated or standing; beads stay)
  const offerings = new Offerings(ctx, net, hud, orchard, player);
  offerings.onOffered = (kind) => addMerit(kind === 'incense' ? 5 : 1); // a fruit: 1 each
  const cloud = new CloudRide(ctx, player, rig, hud);
  bigMap.onTravel = (spot) => {
    if (insideHall()) return hud.toast(t('travel.inside'));
    if (seat.seated || player.mode !== 'free') return hud.toast(t('travel.standUp'));
    cloud.flyTo(spot.arrive);
  };
  const wildlife = new Wildlife(ctx, net, offerings, player, () => remotes.positions()); // registers the cat before the instruments pick it up
  wildlife.onFed = () => addMerit(1);
  const instruments = new Instruments(ctx, net, player);
  // A lantern wall (光明燈) in every hall (not the open shrines).
  const blessing = new LanternBlessing(ctx, net, player, hud);
  const lanternWalls = staticBuild(() => HALLS.filter((h) => h.kind === 'hall').map((h) => new HallLanterns(ctx, net, hud, player, uiEl, settings.name, h.id, blessing)));
  blessing.onHeld = (id) => lanternWalls.forEach((w) => w.heldChanged(id));
  blessing.onCount = (id, n) => lanternWalls.forEach((w) => w.counted(id, n));
  const lanternColour = (id: string) => lanternWalls.map((w) => w.colourOf(id)).find((c) => c !== null) ?? null;
  remotes.lanternOf = (pid) => blessing.colourHeldBy(pid, lanternColour);
  remotes.lampKindOf = (pid) => {
    const id = blessing.heldBy(pid);
    return id && lanternWalls.find((w) => w.colourOf(id) !== null)?.chalices ? 'chalice' : 'lantern';
  };
  const hallWishes = lanternWalls.find((w) => w.hallId === 'baosheng')!;
  const bodhiBell = staticBuild(() => new BodhiBell(ctx));
  for (const w of lanternWalls) w.onHung = (shot) =>
      bodhiBell.ring(shot, () => { // once the bell's sequence is over: the note, and the +100
        hud.toast(t('wish.hung'));
        addMerit(100);
      });
  blessing.onBlessed = () => addMerit(20);
  buildNightLights(); // every lamp is registered by now
  buildFloodlights(ctx);
  // Thousands of small static meshes → a few hundred (draw calls are what phones struggle with).
  // `?nomerge` in the address skips it (to tell a merging problem from a modelling one).
  const noMerge = /[?&]nomerge\b/.test(location.search);
  const merged = noMerge ? { before: 0, after: 0 } : mergeStatic(scene, staticRoots, { skip: new Set(ctx.detailMeshes), keepForRaycast: new Set(ctx.cameraBlockers), zone: interiorLayer });
  let rigid = 0;
  if (!noMerge) scene.traverse((o) => o.userData.rigid && (rigid += mergeRigid(o)));
  // Lights render at any distance: every glow (a lamp's halo) is drawn clear of the fog. The things themselves keep the
  // fog and the interiors' culling distance, so far off the temple is its lights.
  scene.traverse((o) => {
    if (!isGlow(o)) return;
    const m = (o as THREE.Sprite).material as THREE.Material & { fog: boolean };
    if (m.fog) (m.fog = false), (m.needsUpdate = true);
  });
  const inside = assignInteriors(scene, new Set(farCulled()));
  // Statues out of doors (the great stupa's Vairocana): a model of some 150 000 triangles, only drawn within reach
  // (the ones in the halls go with their hall's interior already)
  scene.traverse((o) => {
    if (o.name.startsWith('statue-') && o.layers.mask === 1) cullFar(o, 70, o.getWorldPosition(new THREE.Vector3()));
  });
  // Dev preview only: where you are, in the corner (to point at places when talking it over).
  // (also on the live site for the test names: "flytest" flies and shows this, "model" goes to the model gallery)
  const makeXYZ = () => document.body.appendChild(Object.assign(document.createElement('div'), { style: 'position:fixed;left:8px;bottom:8px;z-index:9999;font:12px/1.2 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.45);padding:3px 6px;border-radius:4px;pointer-events:none' }));
  let devXYZ = import.meta.env.DEV ? makeXYZ() : null, tester: 'fly' | 'model' | null = null;
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
      if (!e.repeat) circle.active ? circle.pressE() : gw.controlling ? gw.pressE() : useInteraction('E'); // each tap counts; holding doesn't auto-push
      return true;
    }
    if (e.code === 'KeyQ' && circle.active) return !e.repeat && circle.stop(), true;
    if (e.code === 'KeyQ' && gw.controlling) return !e.repeat && gw.getOff(), true;
    if (e.code === 'KeyQ' && !player.flying && circle.canStart) return !e.repeat && startCircle(), true;
    if (e.code === 'KeyB') return !e.repeat && bow(), true;
    // Standing: 2 beads, 3 sutra (seated, the seat bar handles the number keys).
    // Dev preview only: F toggles flying (never in the live build).
    if ((import.meta.env.DEV || tester) && e.code === 'KeyF' && !e.repeat && !seat.seated && !cloud.riding) {
      player.flying = !player.flying;
      if (!player.flying) player.pos.y = ctx.ground.heightAt(player.pos.x, player.pos.z);
      hud.toast(player.flying ? 'Flying (dev): WASD · Space up · Q down · Shift fast · F to land' : 'Landed');
      return true;
    }
    if (e.code === 'KeyX' && hud.noticeOpen) return hud.setUpdateNotice(null), true; // (X closes the update banner)
    if (e.code === 'KeyM') return bigMap.toggle(), true;
    if (e.code === 'Escape' && bigMap.isOpen) return bigMap.show(false), true;
    if (e.code === 'Escape' && blessing.active) return blessing.cancel(), true;
    const openWall = lanternWalls.find((w) => w.isOpen);
    if (e.code === 'Escape' && openWall) return openWall.close(), true;
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

  // Frame rate: adaptive pixel ratio; phones on 'auto' boot low then probe high; desktop 'auto' may fall to low.
  // Measured twice a second; a hidden / stalled tab doesn't count.
  let fpsFrames = 0, fpsT = performance.now(), slowFor = 0, playedFor = 0, livedFor = 0, sagFor = 0, easyFor = 0, easyNeed = 10;
  let warmFor = 0, holdFor = 0, probeFailFor = 0, probing = false;
  let probeDone = settings.graphics !== 'auto' || !isTouchDevice || settings.autoLow;
  const measure = () => {
    fpsFrames++;
    const now = performance.now(), span = (now - fpsT) / 1000;
    if (span < 0.5) return;
    const fps = fpsFrames / span;
    fpsFrames = 0;
    fpsT = now;
    hud.setFps(fps, renderer.info.render.calls);
    // Any graphics: drop the render resolution a step when the frame rate sags, raise it again when
    // there's room. Only once it's at 1× does desktop 'auto' fall back to low graphics.
    if (span <= 2) {
      sagFor = fps < 42 ? sagFor + span : 0;
      easyFor = fps > 57 ? easyFor + span : 0;
      const step = sagFor >= 1.5 && pixelRatio() > 1 ? 1 : easyFor >= easyNeed && scaleStep > 0 ? -1 : 0;
      if (step) {
        scaleStep += step;
        renderer.setPixelRatio(pixelRatio()), (SKY_PX.value = renderer.getPixelRatio());
        sagFor = easyFor = 0;
        if (step > 0) easyNeed = Math.min(120, easyNeed * 2); // stepped up too soon: wait longer next time
        if (step > 0) return void (slowFor = 0);
      }
      // Touch 'auto': after Low is stable, try High; remember the outcome (crash mid-probe → autoLow next visit).
      if (!probeDone && settings.graphics === 'auto') {
        const warmNeed = settings.autoHigh ? 1.5 : 3;
        const holdNeed = settings.autoHigh ? 4 : 6;
        if (!probing) {
          warmFor = fps > 55 ? warmFor + span : 0;
          if (livedFor >= warmNeed && warmFor >= warmNeed) {
            probing = true;
            holdFor = probeFailFor = 0;
            beginHighProbe();
            setSessionGraphics('high');
            applyGraphics();
            hud.renderGraphics();
          }
        } else {
          if (fps < 40) probeFailFor += span;
          else (probeFailFor = Math.max(0, probeFailFor - span)), (holdFor += span);
          if (probeFailFor >= 3) {
            probing = false;
            probeDone = true;
            setSessionGraphics('low');
            endHighProbe(false);
            applyGraphics();
            hud.renderGraphics();
            hud.toast(t('settings.autoLow'));
          } else if (holdFor >= holdNeed) {
            const first = !settings.autoHigh;
            probing = false;
            probeDone = true;
            endHighProbe(true);
            hud.renderGraphics();
            if (first) hud.toast(t('settings.autoHigh'));
          }
        }
        return void (slowFor = 0);
      }
      if (pixelRatio() > 1) return void (slowFor = 0);
    }
    if (span > 2 || phase !== 'play' || playedFor < 8 || settings.graphics !== 'auto' || graphicsLevel() === 'low') return void (slowFor = 0);
    slowFor = fps < 40 ? slowFor + span : Math.max(0, slowFor - span);
    if (slowFor < 6) return;
    settings.autoLow = true;
    settings.autoHigh = false;
    setSessionGraphics('low');
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
      livedFor += dt;
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
    if (cloud.riding || bodhiBell.active || gw.controlling || seat.seated) circle.stop();
    circle.update(dt, input);
    if (!bodhiBell.active && !gw.controlling && !circle.active && !garudaFlags.active) player.update(dt, input, rig.yaw, ctx.collisions, ctx.ground); // stand still while the bell rings
    if (devXYZ) devXYZ.textContent = `x ${player.pos.x.toFixed(1)}  y ${player.pos.y.toFixed(1)}  z ${player.pos.z.toFixed(1)}`;

    document.body.classList.toggle('cinematic', bodhiBell.active || garudaFlags.active); // the bell's camera: bottom buttons out of the way
    hud.setWheelOff(gw.canLeave || circle.active, circle.active ? 'prompt.circleOff' : 'prompt.gwOff');
    hud.setCircleHint(phase === 'play' && !landing && !circle.active && !gw.controlling && !seat.seated && !cloud.riding && !bodhiBell.active && !offerings.busy && !blessing.active && circle.canStart);
    garudaFlags.update(dt);
    if (bodhiBell.active || garudaFlags.active) hud.setPrompt(null);
    else if (circle.active) {
      const p = circle.prompt();
      hud.setPrompt(p.text, p.busy, true);
      hud.setMash(circle.mashLevel);
    } else if (gw.controlling) {
      const p = gw.prompt();
      hud.setPrompt(p?.text ?? null, p?.busy, p?.mash);
      if (p?.mash) hud.setMash(gw.mashLevel);
    }
    else if (!seat.seated && !cloud.riding && !offerings.busy && !blessing.active) {
      const it = ctx.interactions.update(player.pos.x, player.pos.z);
      const p = it?.prompt();
      hud.setPrompt(p?.text ?? null, p?.busy, p?.mash, it?.key);
      if (p?.mash) hud.setMash(Math.min(1, (wheels.wheels.get(it!.id)?.speed ?? 0) / WHEEL_MAX)); // (a prayer wheel's: glowing with its speed)
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
    soundscape.update(dt, player.pos, rig.yaw, player.mode === 'free' ? player.avatar.steps : -1);
    if (player.mode === 'free' && !cloud.riding) circ.update(dt, player.pos.x, player.pos.z, circle.active);
    myTrail.update(dt, player.pos, circ.strength);
    player.avatar.setGlow(myTrail.glow * 0.8);

    rig.update(dt, player.pos, seat.seated ? 1.0 : 1.55, ctx.cameraBlockers, ctx.ground);
    bodhiBell.applyCamera(camera);
    garudaFlags.applyCamera(camera, dt); // (Garuda's cinematic, when one is running)
    sky.update(dt);
    sky.follow(player.pos, camera.getWorldDirection(lookDir));

    sendAcc += dt;
    if (sendAcc >= 1 / SNAPSHOT_HZ) {
      sendAcc = 0;
      const flags = (chants.playing ? FLAG_LISTENING : 0) | (offerings.incense ? FLAG_INCENSE : 0) | (offerings.incense === 2 ? FLAG_INCENSE_LIT : 0) | (cloud.riding ? FLAG_CLOUD : 0) | (gw.turning ? FLAG_WHEEL : 0) | (circle.active ? FLAG_CIRCLE : 0) | blessing.flags | (circ.strength << FLAG_TRAIL_SHIFT);
      const tr = player.transform(flags), key = tr.join(',');
      if (key !== lastSent && net.sendMove(tr)) lastSent = key; // (not before the server's welcome: it would be lost)
    }
    mapAcc += dt;
    if (mapAcc > 0.1) {
      mapAcc = 0;
      if (!isTouchDevice || bigMap.isOpen) { // (phones don't show the corner map: only the big one, when it's open)
        const others = remotes.positions();
        if (!isTouchDevice) minimap.draw(player.pos, player.yaw, others);
        bigMap.draw(player.pos, player.yaw, others);
      }
    }
    renderer.render(scene, camera);
    livedFor += dt;
    playedFor += dt;
    measure();
  });

  /** Go online (others start seeing you) — only once you're standing at the gate. */
  net.on('welcome', () => (lastSent = '')); // (re)connected: tell everyone where we are at once
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
  (window as unknown as Record<string, unknown>).temple = { scene, player, ctx, net, seat, rig, wheels, greatWheel: gw, chants, remotes, offerings, mala, cloud, instruments, wildlife, hallWishes, lights, bodhiBell, renderer, setDebugHours, intro, hud, bigMap, travelSpots: TRAVEL_SPOTS, lanternBlessing: blessing, circ };

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
      camera.near = 0.15;
      camera.updateProjectionMatrix();
      ambient.setOn(settings.musicOn);
      player.avatar.setColor(color);
      player.avatar.clasp = false;
      player.avatar.root.name = name;
      for (const w of lanternWalls) w.myName = name;
      joinAs = { name, color };
      phase = 'play';
      const test = name.trim().toLowerCase(); // the test names (see makeXYZ)
      tester = test === 'flytest' ? 'fly' : test === 'model' ? 'model' : null;
      if (tester) devXYZ ??= makeXYZ();
      if (tester === 'model') { // straight to the model gallery, deep under the valley
        const at = buildModelGallery(ctx, models, () => player.pos.y < -200);
        player.pos.set(at.x, at.y, at.z);
        player.yaw = at.yaw;
        rig.lookAlong(at.yaw, 0.12, 6);
        landing = false;
        document.body.classList.remove('intro');
        join();
        if (chants.index < 0) chants.play(0);
        return;
      }
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
