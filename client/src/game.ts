import * as THREE from 'three';
import { FLAG_CLOUD, FLAG_INCENSE, FLAG_INCENSE_LIT, FLAG_LISTENING, SNAPSHOT_HZ } from '../../shared/protocol';
import { ChantPanel } from './activities/chantPanel';
import { Mala } from './activities/beads';
import { CloudRide } from './activities/cloudRide';
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
import { buildHall } from './buildings/hall';
import { PrayerWheels } from './buildings/prayerWheels';
import { buildStupas } from './buildings/stupas';
import { BASIN, BODHI_TREE, HALLS } from './config/layout';
import { graphicsLevel, isTouchDevice } from './config/settings';
import { loadModelMap, loadThangkas } from './content/manifest';
import { CollisionWorld } from './core/collisions';
import type { WorldContext } from './core/context';
import { Ground } from './core/ground';
import { Input } from './core/input';
import { InteractionSystem } from './core/interaction';
import { onLocaleChange } from './i18n';
import { NetClient } from './net/netClient';
import { RemotePlayers } from './net/remotePlayers';
import { CameraRig } from './player/cameraRig';
import { LocalPlayer } from './player/localPlayer';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { mountJoystick } from './ui/touch';
import { buildKoi } from './world/koi';
import { buildLeaves } from './world/leaves';
import { buildPrayerFlags } from './world/prayerFlags';
import { buildSky } from './world/sky';
import { buildTerrain } from './world/terrain';
import { buildVegetation } from './world/vegetation';
import { buildPond, buildStream, buildWaterfall } from './world/water';

export async function startGame(appEl: HTMLElement, uiEl: HTMLElement, name: string, color: string) {
  unlockAudio();

  // ---------- Renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  appEl.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 3000);
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
    updaters: [],
    detailMeshes: [],
  };

  // ---------- World ----------
  const sky = buildSky(scene, renderer);
  buildTerrain(scene);
  const [models, thangkas] = await Promise.all([loadModelMap(), loadThangkas()]);
  buildDecor(ctx);
  buildBenches(ctx);
  for (const def of HALLS) buildHall(ctx, def, models, thangkas);
  buildPond(ctx);
  buildWaterfall(ctx);
  buildStream(ctx);
  const stupas = buildStupas(ctx);
  buildPrayerFlags(ctx, stupas);
  buildDecorations(ctx, stupas);
  buildKoi(ctx);
  buildLeaves(ctx, camera);
  const { orchard } = buildVegetation(ctx);

  // High / low graphics: pixel ratio, shadows, grass & flowers.
  const applyGraphics = () => {
    const low = graphicsLevel() === 'low';
    renderer.setPixelRatio(low ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 2));
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
  const player = new LocalPlayer(color, name);
  player.pos.y = ctx.ground.heightAt(player.pos.x, player.pos.z);
  scene.add(player.avatar.root);
  const rig = new CameraRig(camera, renderer.domElement);
  const remotes = new RemotePlayers(scene);

  const ambient = new Ambient();
  const chants = new ChantPlayer();
  // Birdsong comes from the orchard, the Bodhi tree, the cherry avenue and the forest edge.
  const birdPoints = [
    ...orchard.trees.map((t) => new THREE.Vector3(t.x, 3, t.z)),
    new THREE.Vector3(BODHI_TREE.x, 6, BODHI_TREE.z),
    ...[80, 95, 110].flatMap((z) => [new THREE.Vector3(-11, 4, z), new THREE.Vector3(11, 4, z)]),
    ...Array.from({ length: 28 }, (_, i) => new THREE.Vector3(BASIN.x + Math.sin(i * 0.2244) * (BASIN.radius - 6), 5, BASIN.z + Math.cos(i * 0.2244) * (BASIN.radius - 6))),
  ];
  const soundscape = new Soundscape(birdPoints);

  const minimap = new Minimap(uiEl);
  const hud: Hud = new Hud(uiEl, {
    onMusic: (on) => ambient.setOn(on),
    onSeatAction: (a) => seat.action(a),
    onChants: () => chantPanel.show(!chantPanel.isOpen),
    onMap: () => minimap.toggle(),
    onPrompt: () => !seat.seated && ctx.interactions.trigger(),
    onBow: () => bow(),
    onBeadStep: (dir) => mala.step(dir),
    onGraphics: () => applyGraphics(),
  });
  onLocaleChange(() => hud.refreshText());
  void ambient.init().then(() => hud.renderMusic(ambient.available));
  void chants.init();
  void soundscape.init();
  const sutra = new SutraReader(uiEl);
  const chantPanel = new ChantPanel(uiEl, chants);
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
  const bow = (): void => (seat.seated ? seat.bow() : player.gesture("bow", 2.4));

  // Networking
  net.on('status', (s) => hud.setStatus(s, remotes.count + 1));
  net.on('welcome', (msg) => {
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
  net.connect(name, color);

  // Global keys (lowest priority — the seat handler, registered after, gets first pick while seated)
  input.onKey((e) => {
    if (e.code === 'KeyE') {
      if (!e.repeat) ctx.interactions.trigger(); // each tap counts; holding doesn't auto-push
      return true;
    }
    if (e.code === 'KeyB') return !e.repeat && bow(), true;
    if (e.code === 'KeyM') return minimap.toggle(), true;
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
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;

    cloud.update(dt, time);
    player.update(dt, input, rig.yaw, ctx.collisions, ctx.ground);

    if (!seat.seated && !cloud.riding && !offerings.busy) {
      const it = ctx.interactions.update(player.pos.x, player.pos.z);
      const p = it?.prompt();
      hud.setPrompt(p?.text ?? null, p?.busy);
    }

    wheels.update(dt);
    offerings.update(dt);
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
    sky.follow(player.pos);

    sendAcc += dt;
    if (sendAcc >= 1 / SNAPSHOT_HZ) {
      sendAcc = 0;
      const flags = (chants.playing ? FLAG_LISTENING : 0) | (offerings.incense ? FLAG_INCENSE : 0) | (offerings.incense === 2 ? FLAG_INCENSE_LIT : 0) | (cloud.riding ? FLAG_CLOUD : 0);
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
    }
    renderer.render(scene, camera);
  });

  // Debug handle for the console during development.
  (window as unknown as Record<string, unknown>).temple = { scene, player, ctx, net, seat, rig, wheels, chants, remotes, offerings, mala, cloud };
}
