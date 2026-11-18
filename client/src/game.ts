import * as THREE from 'three';
import { FLAG_LISTENING, SNAPSHOT_HZ } from '../../shared/protocol';
import { ChantPanel } from './activities/chantPanel';
import { Mala } from './activities/beads';
import { SeatSession } from './activities/seatSession';
import { SutraReader } from './activities/sutraReader';
import { Ambient } from './audio/ambient';
import { ChantPlayer } from './audio/chantPlayer';
import { unlockAudio } from './audio/sfx';
import { buildBenches } from './buildings/benches';
import { buildStupas } from './buildings/stupas';
import { buildDecor } from './buildings/decor';
import { buildHall } from './buildings/hall';
import { PrayerWheels } from './buildings/prayerWheels';
import { HALLS } from './config/layout';
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
import { buildSky } from './world/sky';
import { buildTerrain } from './world/terrain';
import { buildVegetation } from './world/vegetation';
import { buildPond, buildWaterfall } from './world/water';

export async function startGame(appEl: HTMLElement, uiEl: HTMLElement, name: string, color: string) {
  unlockAudio();

  // ---------- Renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
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
  buildStupas(ctx);
  buildVegetation(ctx); // returns fruit spots for the future picking feature

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

  const minimap = new Minimap(uiEl);
  const hud = new Hud(uiEl, {
    onMusic: (on) => ambient.setOn(on),
    onSeatAction: (a) => seat.action(a),
    onChants: () => chantPanel.show(!chantPanel.isOpen),
    onMap: () => minimap.toggle(),
  });
  onLocaleChange(() => hud.refreshText());
  void ambient.init().then(() => hud.renderMusic(ambient.available));
  void chants.init();
  const sutra = new SutraReader(uiEl);
  const chantPanel = new ChantPanel(uiEl, chants);
  const mala = new Mala(camera);

  // Prayer wheels: tap E beside one to push it. Local pushes apply instantly; the server
  // echoes everyone's pushes with the authoritative speed.
  const wheels = new PrayerWheels(ctx, (w) => net.pushWheel(w.id));
  net.on('push', (id, _by, speed) => wheels.setSpeed(id, speed));
  net.on('welcome', (_p, _s, speeds) => {
    for (const id in speeds) wheels.setSpeed(id, speeds[id], true);
  });

  const seat = new SeatSession({ ctx, net, player, rig, hud, mala, sutra });

  // Networking
  net.on('status', (s) => hud.setStatus(s, remotes.count + 1));
  net.on('welcome', (players) => {
    remotes.reset(players);
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

  // Global keys (lowest priority — panels/seat registered later get first pick)
  input.onKey((e) => {
    if (e.code === 'KeyE') {
      if (!e.repeat) ctx.interactions.trigger(); // each tap counts; holding doesn't auto-push
      return true;
    }
    if (e.code === 'KeyM') return minimap.toggle(), true;
    if (e.code === 'KeyC') return chantPanel.show(!chantPanel.isOpen), true; // listening works anywhere
    if (e.code === 'Escape' && chantPanel.isOpen) return chantPanel.show(false), true;
    if (e.code === 'Escape' && hud.helpOpen) return hud.toggleHelp(false), true;
    return false;
  });
  // Registered after the global handler, so it gets first pick while seated.
  input.onKey((e) => seat.handleKey(e));

  // ---------- Loop ----------
  const clock = new THREE.Clock();
  let sendAcc = 0, mapAcc = 0, lastSent = '';
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;

    player.update(dt, input, rig.yaw, ctx.collisions, ctx.ground);

    if (!seat.seated) {
      const it = ctx.interactions.update(player.pos.x, player.pos.z);
      const p = it?.prompt();
      hud.setPrompt(p?.text ?? null, p?.busy);
    }

    wheels.update(dt);
    remotes.update(dt, camera);
    for (const u of ctx.updaters) u(dt, time);
    seat.update();
    ambient.duck = chants.playing ? 0.3 : 1; // lower ambience under chants
    player.avatar.setListening(chants.playing);
    mala.update(dt);
    ambient.update(dt);
    chants.update(dt);

    rig.update(dt, player.pos, seat.seated ? 1.0 : 1.55, ctx.cameraBlockers, ctx.ground);
    sky.follow(player.pos);

    sendAcc += dt;
    if (sendAcc >= 1 / SNAPSHOT_HZ) {
      sendAcc = 0;
      const tr = player.transform(chants.playing ? FLAG_LISTENING : 0), key = tr.join(',');
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
  (window as unknown as Record<string, unknown>).temple = { scene, player, ctx, net, seat, rig, wheels, chants, remotes };
}
