/**
 * Hazard Hunter — three.js world: procedural geometry + canvas textures,
 * first-person pointer-lock controls, AABB collision, raycast inspection,
 * ambient animation (forklift, dust motes, flickering light, hover shimmer).
 */
import * as THREE from 'three';
import type { HazardDef, LevelDef } from './hazard-data';

// ---------------------------------------------------------------------------
// Canvas-generated textures
// ---------------------------------------------------------------------------

function makeCanvas(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function concreteTexture(): THREE.CanvasTexture {
  const tex = makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#8d8d8a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      const g = 110 + Math.floor(Math.random() * 60);
      ctx.fillStyle = `rgba(${g},${g},${g - 4},${0.16 + Math.random() * 0.22})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.strokeStyle = 'rgba(60,60,58,0.5)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let s = 0; s < 7; s++) {
        x += (Math.random() - 0.5) * 130;
        y += (Math.random() - 0.5) * 130;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

function wallTexture(tint: string): THREE.CanvasTexture {
  const tex = makeCanvas(512, 256, (ctx, w, h) => {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 2;
    const bw = 64;
    const bh = 32;
    for (let y = 0; y < h; y += bh) {
      const off = (y / bh) % 2 === 0 ? 0 : bw / 2;
      for (let x = -bw; x < w + bw; x += bw) {
        ctx.strokeRect(x + off, y, bw, bh);
      }
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1.5);
  return tex;
}

function cardboardTexture(): THREE.CanvasTexture {
  return makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b98c52';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1300; i++) {
      ctx.fillStyle = `rgba(120,84,40,${Math.random() * 0.18})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 2);
    }
    ctx.strokeStyle = 'rgba(96,64,28,0.85)';
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = 'rgba(96,64,28,0.85)';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('THIS SIDE UP', 38, 64);
    ctx.beginPath();
    ctx.moveTo(54, 110);
    ctx.lineTo(70, 86);
    ctx.lineTo(86, 110);
    ctx.fill();
    ctx.fillRect(64, 104, 12, 34);
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('FRAGILE', 140, 120);
  });
}

function cautionTexture(): THREE.CanvasTexture {
  const tex = makeCanvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f5c518';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1a1a1a';
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 16, 0);
      ctx.lineTo(x + 16 + h, h);
      ctx.lineTo(x + h, h);
      ctx.closePath();
      ctx.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function signTexture(
  lines: string[],
  opts: { bg: string; fg: string; border?: string; fontPx?: number },
): THREE.CanvasTexture {
  return makeCanvas(256, 160, (ctx, w, h) => {
    ctx.fillStyle = opts.bg;
    ctx.fillRect(0, 0, w, h);
    if (opts.border) {
      ctx.strokeStyle = opts.border;
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, w - 16, h - 16);
    }
    ctx.fillStyle = opts.fg;
    const fontPx = opts.fontPx ?? 30;
    ctx.font = `bold ${fontPx}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = fontPx * 1.25;
    const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((line, i) => ctx.fillText(line, w / 2, y0 + i * lh));
  });
}

function pegboardTexture(): THREE.CanvasTexture {
  return makeCanvas(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#caa472';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(70,50,28,0.8)';
    for (let y = 12; y < h; y += 24) {
      for (let x = 12; x < w; x += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // tool silhouettes
    ctx.fillStyle = 'rgba(40,40,46,0.92)';
    ctx.fillRect(40, 40, 14, 110); // wrench shaft
    ctx.beginPath();
    ctx.arc(47, 36, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(110, 36, 60, 18); // hammer head
    ctx.fillRect(132, 54, 14, 100);
    ctx.fillRect(220, 40, 10, 120); // screwdrivers
    ctx.fillRect(250, 40, 10, 120);
    ctx.beginPath(); // saw
    ctx.moveTo(320, 50);
    ctx.lineTo(470, 50);
    ctx.lineTo(470, 86);
    ctx.lineTo(340, 110);
    ctx.closePath();
    ctx.fill();
  });
}

// ---------------------------------------------------------------------------
// Small builder helpers
// ---------------------------------------------------------------------------

function std(
  color: number,
  opts: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...opts });
}

function box(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(
  rTop: number,
  rBot: number,
  h: number,
  material: THREE.Material,
  seg = 16,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A drooping wire as a thin tube along a sagging curve. */
function wire(from: THREE.Vector3, to: THREE.Vector3, sag: number, color = 0x202024): THREE.Mesh {
  const mid = from.clone().lerp(to, 0.5);
  mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 12, 0.016, 6),
    std(color, { roughness: 0.5 }),
  );
  mesh.castShadow = true;
  return mesh;
}

interface PropOptions {
  collide?: boolean;
  inspectable?: boolean;
  propName?: string;
  hazardId?: string;
}

export interface PickResult {
  kind: 'hazard' | 'object' | 'nothing' | 'too-far';
  hazardId?: string;
  propName?: string;
}

export interface WorldCallbacks {
  onInspect: (hit: PickResult) => void;
  onLockChange: (locked: boolean) => void;
}

interface FlickerLight {
  light: THREE.PointLight;
  mat: THREE.MeshStandardMaterial;
  t: number;
}

const INSPECT_RANGE = 10;
const EYE_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.38;

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export class HazardWorld {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly container: HTMLElement;
  private readonly cb: WorldCallbacks;
  private readonly resizeObserver: ResizeObserver | null = null;

  private levelRoot: THREE.Group | null = null;
  private colliders: THREE.Box3[] = [];
  private hazardGroups = new Map<string, THREE.Group>();
  private foundIds = new Set<string>();
  private level: LevelDef | null = null;

  // controls
  private yaw = Math.PI;
  private pitch = 0;
  private keys = new Set<string>();
  private locked = false;
  private active = false;

  // animation registry
  private animators: Array<(dt: number, t: number) => void> = [];
  private dust: THREE.Points | null = null;
  private hoverId: string | null = null;
  private hoverTime = 0;
  private shimmerMats: THREE.MeshStandardMaterial[] = [];

  private rafId = 0;
  private lastTime = 0;
  private disposed = false;

  constructor(container: HTMLElement, cb: WorldCallbacks) {
    this.container = container;
    this.cb = cb;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.inset = '0';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      72,
      (container.clientWidth || 800) / (container.clientHeight || 600),
      0.1,
      80,
    );
    this.camera.position.set(0, EYE_HEIGHT, 9);
    this.camera.rotation.order = 'YXZ';

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(container);
    }

    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  // -- public API -----------------------------------------------------------

  loadLevel(level: LevelDef): void {
    this.clearLevel();
    this.level = level;
    this.foundIds.clear();
    this.hoverId = null;
    this.hoverTime = 0;

    const root = new THREE.Group();
    this.levelRoot = root;
    this.scene.add(root);

    const isWarehouse = level.id === 1;
    const bg = isWarehouse ? 0x2a2e33 : 0x33302a;
    this.scene.background = new THREE.Color(bg);
    this.scene.fog = new THREE.Fog(bg, 16, isWarehouse ? 48 : 36);

    this.buildRoom(root, level, isWarehouse);
    if (isWarehouse) this.buildWarehouseDressing(root);
    else this.buildToolshopDressing(root);

    for (const hazard of level.hazards) this.buildHazard(root, hazard);

    this.buildDust(root, level);

    const [sx, sy, sz] = level.spawn;
    this.camera.position.set(sx, sy, sz);
    this.yaw = Math.PI;
    this.pitch = 0;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.keys.clear();
  }

  get isLocked(): boolean {
    return this.locked;
  }

  requestLock(): void {
    if (this.locked) return;
    try {
      // Chrome returns a promise and can reject if re-locking too soon
      // after an Esc-driven exit — never let that surface.
      const res = this.renderer.domElement.requestPointerLock?.() as Promise<void> | undefined;
      res?.catch?.(() => undefined);
    } catch {
      // Pointer lock unsupported — game remains viewable.
    }
  }

  exitLock(): void {
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  markFound(id: string): void {
    this.foundIds.add(id);
    const group = this.hazardGroups.get(id);
    if (!group) return;
    this.clearShimmer();
    // Green "verified" halo ring above the prop.
    const bounds = new THREE.Box3().setFromObject(group);
    const center = bounds.getCenter(new THREE.Vector3());
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.045, 10, 32),
      new THREE.MeshStandardMaterial({
        color: 0x2bd97c,
        emissive: 0x2bd97c,
        emissiveIntensity: 1.4,
        roughness: 0.4,
      }),
    );
    ring.position.set(center.x, Math.min(bounds.max.y + 0.45, 5.4), center.z);
    ring.rotation.x = Math.PI / 2;
    this.levelRoot?.add(ring);
    this.animators.push((dt, t) => {
      ring.rotation.z = t * 1.4;
      ring.position.y += Math.sin(t * 2.4) * 0.0012;
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.resizeObserver?.disconnect();
    this.exitLock();
    this.clearLevel();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // -- event handlers ---------------------------------------------------------

  private onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.renderer.domElement;
    if (!this.locked) this.keys.clear();
    this.cb.onLockChange(this.locked);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked || !this.active) return;
    this.yaw -= e.movementX * 0.0023;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - e.movementY * 0.0023,
      -Math.PI / 2 + 0.05,
      Math.PI / 2 - 0.05,
    );
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.active || !this.locked || e.button !== 0) return;
    this.cb.onInspect(this.pick());
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.active) return;
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onResize(): void {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // -- frame loop -------------------------------------------------------------

  private tick = (now: number): void => {
    if (this.disposed) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    const t = now / 1000;

    if (this.active && this.locked) this.updateMovement(dt);
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    for (const anim of this.animators) anim(dt, t);
    this.updateHoverShimmer(dt, t);

    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private updateMovement(dt: number): void {
    const speed = this.keys.has('ShiftLeft') ? 6 : 4;
    let fwd = 0;
    let strafe = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fwd += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fwd -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
    if (fwd === 0 && strafe === 0) return;

    const len = Math.hypot(fwd, strafe);
    fwd /= len;
    strafe /= len;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const dx = (-sin * fwd + cos * strafe) * speed * dt;
    const dz = (-cos * fwd - sin * strafe) * speed * dt;

    const p = this.camera.position;
    const half = this.level
      ? [this.level.roomHalfWidth - 0.55, this.level.roomHalfDepth - 0.55]
      : [14, 11];

    const tryAxis = (nx: number, nz: number): boolean => {
      if (Math.abs(nx) > half[0] || Math.abs(nz) > half[1]) return false;
      for (const c of this.colliders) {
        if (
          nx > c.min.x - PLAYER_RADIUS &&
          nx < c.max.x + PLAYER_RADIUS &&
          nz > c.min.z - PLAYER_RADIUS &&
          nz < c.max.z + PLAYER_RADIUS &&
          c.max.y > 0.3 &&
          c.min.y < EYE_HEIGHT
        ) {
          return false;
        }
      }
      return true;
    };

    if (tryAxis(p.x + dx, p.z)) p.x += dx;
    if (tryAxis(p.x, p.z + dz)) p.z += dz;
    // Gentle head-bob.
    p.y = EYE_HEIGHT + Math.sin(performance.now() / 180) * 0.022;
  }

  // -- picking & shimmer --------------------------------------------------------

  private pick(): PickResult {
    if (!this.levelRoot) return { kind: 'nothing' };
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 60;
    const hits = this.raycaster.intersectObjects(this.levelRoot.children, true);
    for (const hit of hits) {
      if (hit.object === this.dust) continue;
      const meta = this.findMeta(hit.object);
      if (!meta || !meta['inspectable']) {
        // Environment surface (floor/wall/ceiling) — not an inspection.
        return { kind: 'nothing' };
      }
      if (hit.distance > INSPECT_RANGE) return { kind: 'too-far' };
      const hazardId = meta['hazardId'] as string | undefined;
      if (hazardId) {
        return {
          kind: 'hazard',
          hazardId,
          propName: meta['propName'] as string | undefined,
        };
      }
      return { kind: 'object', propName: meta['propName'] as string };
    }
    return { kind: 'nothing' };
  }

  private findMeta(obj: THREE.Object3D): Record<string, unknown> | null {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur.userData['inspectable'] || cur.userData['environment']) {
        return cur.userData as Record<string, unknown>;
      }
      cur = cur.parent;
    }
    return null;
  }

  /**
   * Subtle emissive shimmer on a hazard, only after the player has dwelled
   * on it for ~0.9s — never gives hazards away at a glance.
   */
  private updateHoverShimmer(dt: number, t: number): void {
    if (!this.active || !this.locked || !this.levelRoot) {
      this.setHover(null);
      return;
    }
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this.raycaster.intersectObjects(this.levelRoot.children, true);
    let hoverId: string | null = null;
    for (const hit of hits) {
      if (hit.object === this.dust) continue;
      if (hit.distance > INSPECT_RANGE) break;
      const meta = this.findMeta(hit.object);
      const id = meta?.['hazardId'] as string | undefined;
      if (id && !this.foundIds.has(id)) hoverId = id;
      break;
    }
    this.setHover(hoverId);
    if (this.hoverId) {
      this.hoverTime += dt;
      if (this.hoverTime > 0.9) {
        const pulse = 0.1 + (Math.sin(t * 5) * 0.5 + 0.5) * 0.16;
        for (const m of this.shimmerMats) m.emissiveIntensity = pulse;
      }
    }
  }

  private setHover(id: string | null): void {
    if (id === this.hoverId) return;
    this.clearShimmer();
    this.hoverId = id;
    this.hoverTime = 0;
    if (!id) return;
    const group = this.hazardGroups.get(id);
    if (!group) return;
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const sm = m as THREE.MeshStandardMaterial;
          if (sm.isMeshStandardMaterial && !sm.userData['noShimmer']) {
            sm.userData['savedEmissive'] = sm.emissive.getHex();
            sm.userData['savedIntensity'] = sm.emissiveIntensity;
            sm.emissive.setHex(0xffe28a);
            sm.emissiveIntensity = 0;
            this.shimmerMats.push(sm);
          }
        }
      }
    });
  }

  private clearShimmer(): void {
    for (const m of this.shimmerMats) {
      m.emissive.setHex((m.userData['savedEmissive'] as number) ?? 0);
      m.emissiveIntensity = (m.userData['savedIntensity'] as number) ?? 1;
    }
    this.shimmerMats = [];
  }

  // -- scene teardown -------------------------------------------------------

  private clearLevel(): void {
    this.clearShimmer();
    this.animators = [];
    this.colliders = [];
    this.hazardGroups.clear();
    this.dust = null;
    if (!this.levelRoot) return;
    this.levelRoot.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh || (o as THREE.Points).type === 'Points') {
        mesh.geometry?.dispose?.();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!m) continue;
          const sm = m as THREE.MeshStandardMaterial;
          sm.map?.dispose?.();
          sm.emissiveMap?.dispose?.();
          m.dispose();
        }
      }
    });
    this.scene.remove(this.levelRoot);
    this.levelRoot = null;
  }

  // -- registration helpers ---------------------------------------------------

  private addProp(
    root: THREE.Group,
    group: THREE.Group,
    pos: [number, number, number],
    opts: PropOptions = {},
    rotY = 0,
  ): THREE.Group {
    group.position.set(pos[0], pos[1], pos[2]);
    group.rotation.y = rotY;
    if (opts.inspectable) {
      group.userData['inspectable'] = true;
      group.userData['propName'] = opts.propName ?? 'equipment';
      if (opts.hazardId) group.userData['hazardId'] = opts.hazardId;
    }
    root.add(group);
    if (opts.collide) {
      group.updateMatrixWorld(true);
      this.colliders.push(new THREE.Box3().setFromObject(group));
    }
    return group;
  }

  // -- room + lighting ----------------------------------------------------------

  private buildRoom(root: THREE.Group, level: LevelDef, isWarehouse: boolean): void {
    const W = level.roomHalfWidth * 2;
    const D = level.roomHalfDepth * 2;
    const H = isWarehouse ? 6 : 4.2;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({
        map: concreteTexture(),
        roughness: 0.92,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.userData['environment'] = true;
    root.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTexture(isWarehouse ? '#9aa0a6' : '#a8a08c'),
      roughness: 0.95,
    });
    const walls: Array<[number, number, number, number, number]> = [
      // [x, z, rotY, width]
      [0, -level.roomHalfDepth, 0, W, H],
      [0, level.roomHalfDepth, Math.PI, W, H],
      [-level.roomHalfWidth, 0, Math.PI / 2, D, H],
      [level.roomHalfWidth, 0, -Math.PI / 2, D, H],
    ];
    for (const [x, z, rot, w, h] of walls) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      wall.position.set(x, h / 2, z);
      wall.rotation.y = rot;
      wall.receiveShadow = true;
      wall.userData['environment'] = true;
      root.add(wall);
    }

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std(0x3c4046, { roughness: 1 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = H;
    ceiling.userData['environment'] = true;
    root.add(ceiling);

    // Caution stripe along the main aisle.
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, D - 2),
      new THREE.MeshStandardMaterial({ map: cautionTexture(), roughness: 0.9 }),
    );
    (stripe.material as THREE.MeshStandardMaterial).map?.repeat.set(1, 14);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(isWarehouse ? -1.6 : -3, 0.012, 0);
    stripe.userData['environment'] = true;
    root.add(stripe);

    // Lighting: ambient + shadowed key light + ceiling fixtures.
    root.add(new THREE.AmbientLight(0xcfd6e4, 0.55));
    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x4a4438, 0.35);
    root.add(hemi);
    const key = new THREE.DirectionalLight(0xfff2d8, 1.35);
    key.position.set(6, H + 4, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -level.roomHalfWidth - 2;
    key.shadow.camera.right = level.roomHalfWidth + 2;
    key.shadow.camera.top = level.roomHalfDepth + 2;
    key.shadow.camera.bottom = -level.roomHalfDepth - 2;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.0004;
    root.add(key);

    // Fixture rows (visual) + a couple of fill point lights.
    const fixtureMat = std(0x4f545b);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xf4f7ff,
      emissive: 0xeef3ff,
      emissiveIntensity: 1.1,
    });
    tubeMat.userData['noShimmer'] = true;
    const rows = isWarehouse ? [-7, 0, 7] : [-4, 4];
    for (const x of rows) {
      for (let z = -level.roomHalfDepth + 4; z <= level.roomHalfDepth - 4; z += 6) {
        // The broken-light hazard builds its own fixture at (0, H-0.5, -2).
        if (isWarehouse && x === 0 && Math.abs(z - -2) < 1.5) continue;
        const fix = new THREE.Group();
        fix.add(box(1.8, 0.12, 0.5, fixtureMat));
        const glow = box(1.6, 0.06, 0.34, tubeMat);
        glow.position.y = -0.08;
        fix.add(glow);
        fix.position.set(x, H - 0.35, z);
        root.add(fix);
      }
      const fill = new THREE.PointLight(0xe8eeff, 14, 22, 1.8);
      fill.position.set(x, H - 0.8, 0);
      root.add(fill);
    }
  }

  private buildDust(root: THREE.Group, level: LevelDef): void {
    const count = 240;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * level.roomHalfWidth;
      positions[i * 3 + 1] = Math.random() * 4 + 0.3;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * level.roomHalfDepth;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xd8d2bf,
        size: 0.035,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    dust.userData['environment'] = true;
    root.add(dust);
    this.dust = dust;
    const attr = geo.getAttribute('position') as THREE.BufferAttribute;
    this.animators.push((dt, t) => {
      for (let i = 0; i < count; i++) {
        let y = attr.getY(i) + dt * 0.07;
        const x = attr.getX(i) + Math.sin(t * 0.4 + i) * dt * 0.05;
        if (y > 4.4) y = 0.25;
        attr.setY(i, y);
        attr.setX(i, x);
      }
      attr.needsUpdate = true;
    });
  }

  // -- shared prop builders --------------------------------------------------

  private cardboard = (): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ map: cardboardTexture(), roughness: 0.9 });

  private buildBoxStack(tidy: boolean): THREE.Group {
    const g = new THREE.Group();
    const mat = this.cardboard();
    const sizes: Array<[number, number, number, number, number, number, number]> = tidy
      ? [
          [0, 0.3, 0, 0.85, 0.6, 0.85, 0],
          [0, 0.9, 0, 0.85, 0.6, 0.85, 0],
          [0, 1.45, 0, 0.7, 0.5, 0.7, 0],
        ]
      : [
          [0, 0.3, 0, 0.85, 0.6, 0.85, 0],
          [0.16, 0.92, 0.1, 0.9, 0.62, 0.9, 0.12],
          [0.45, 1.55, 0.2, 0.95, 0.6, 0.95, 0.3],
        ];
    for (const [x, y, z, w, h, d, rot] of sizes) {
      const b = box(w, h, d, mat);
      b.position.set(x, y, z);
      b.rotation.y = rot;
      g.add(b);
    }
    return g;
  }

  private buildPallet(): THREE.Group {
    const g = new THREE.Group();
    const wood = std(0x9c7a4a);
    for (let i = 0; i < 5; i++) {
      const slat = box(1.1, 0.04, 0.16, wood);
      slat.position.set(0, 0.13, -0.44 + i * 0.22);
      g.add(slat);
    }
    for (const x of [-0.48, 0, 0.48]) {
      const block = box(0.12, 0.1, 1.05, wood);
      block.position.set(x, 0.06, 0);
      g.add(block);
    }
    return g;
  }

  private buildShelvingRack(withBoxes = true): THREE.Group {
    const g = new THREE.Group();
    const steel = std(0x2e64a8, { roughness: 0.55, metalness: 0.35 });
    const beam = std(0xd97a1e, { roughness: 0.55, metalness: 0.3 });
    const deck = std(0x8a8f96, { metalness: 0.2 });
    const L = 7;
    for (const x of [-L / 2, L / 2]) {
      for (const z of [-0.55, 0.55]) {
        const up = box(0.1, 4.4, 0.1, steel);
        up.position.set(x, 2.2, z);
        g.add(up);
      }
    }
    const cardboardMat = this.cardboard();
    for (const y of [0.5, 1.9, 3.3]) {
      for (const z of [-0.55, 0.55]) {
        const b = box(L, 0.1, 0.08, beam);
        b.position.set(0, y, z);
        g.add(b);
      }
      const shelf = box(L, 0.05, 1.1, deck);
      shelf.position.set(0, y + 0.06, 0);
      g.add(shelf);
      if (withBoxes) {
        for (let i = 0; i < 4; i++) {
          if (Math.random() < 0.25) continue;
          const w = 0.7 + Math.random() * 0.4;
          const h = 0.5 + Math.random() * 0.4;
          const b = box(w, h, 0.8, cardboardMat);
          b.position.set(-2.6 + i * 1.7, y + 0.09 + h / 2, 0);
          b.rotation.y = (Math.random() - 0.5) * 0.15;
          g.add(b);
        }
      }
    }
    return g;
  }

  private buildExitDoor(blocked: boolean): THREE.Group {
    const g = new THREE.Group();
    const door = box(0.1, 2.1, 1.0, std(0x6f7d8c, { metalness: 0.3 }));
    door.position.set(0, 1.05, 0);
    g.add(door);
    const barMat = std(0xc8ccd2, { metalness: 0.6, roughness: 0.3 });
    const bar = box(0.06, 0.07, 0.8, barMat);
    bar.position.set(-0.09, 1.0, 0);
    g.add(bar);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.34),
      new THREE.MeshStandardMaterial({
        map: signTexture(['EXIT'], { bg: '#0a3d1e', fg: '#7dffb0', fontPx: 76 }),
        emissive: 0x2f8a4f,
        emissiveIntensity: 0.7,
      }),
    );
    (sign.material as THREE.MeshStandardMaterial).userData['noShimmer'] = true;
    sign.position.set(-0.12, 2.45, 0);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    if (blocked) {
      const stack = this.buildBoxStack(true);
      stack.position.set(-0.85, 0, 0.1);
      g.add(stack);
      const stack2 = this.buildBoxStack(true);
      stack2.scale.setScalar(0.8);
      stack2.position.set(-0.8, 0, -0.85);
      g.add(stack2);
      const dolly = box(0.7, 0.18, 0.5, std(0x444a52, { metalness: 0.4 }));
      dolly.position.set(-1.5, 0.09, 0.4);
      g.add(dolly);
    }
    return g;
  }

  private buildExtinguisher(blocked: boolean): THREE.Group {
    const g = new THREE.Group();
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.62),
      new THREE.MeshStandardMaterial({
        map: signTexture(['FIRE', 'EXT.'], {
          bg: '#c01818',
          fg: '#ffffff',
          border: '#ffffff',
          fontPx: 52,
        }),
      }),
    );
    sign.position.set(0.06, 2.0, 0);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    const body = cyl(0.11, 0.11, 0.55, std(0xc01818, { roughness: 0.35 }));
    body.position.set(0.2, 1.25, 0);
    g.add(body);
    const neck = cyl(0.035, 0.035, 0.12, std(0x222222));
    neck.position.set(0.2, 1.58, 0);
    g.add(neck);
    if (blocked) {
      const pallet = this.buildPallet();
      pallet.position.set(0.95, 0, 0);
      g.add(pallet);
      const stack = this.buildBoxStack(true);
      stack.scale.setScalar(0.95);
      stack.position.set(0.95, 0.16, 0);
      g.add(stack);
    }
    return g;
  }

  private buildForklift(raised: boolean): THREE.Group {
    const g = new THREE.Group();
    const bodyGroup = new THREE.Group();
    const body = box(1.3, 0.7, 2.0, std(0xe8a013, { roughness: 0.45 }));
    body.position.y = 0.75;
    bodyGroup.add(body);
    const counter = box(1.2, 0.5, 0.6, std(0x3a3d42));
    counter.position.set(0, 0.65, 0.95);
    bodyGroup.add(counter);
    const cageMat = std(0x33373c, { metalness: 0.4 });
    for (const [x, z] of [
      [-0.55, -0.45],
      [0.55, -0.45],
      [-0.55, 0.55],
      [0.55, 0.55],
    ]) {
      const post = box(0.07, 1.1, 0.07, cageMat);
      post.position.set(x, 1.65, z);
      bodyGroup.add(post);
    }
    const roof = box(1.25, 0.06, 1.15, cageMat);
    roof.position.set(0, 2.2, 0.05);
    bodyGroup.add(roof);
    const seat = box(0.5, 0.4, 0.45, std(0x222428));
    seat.position.set(0, 1.3, 0.35);
    bodyGroup.add(seat);
    const wheelMat = std(0x17181a, { roughness: 0.95 });
    for (const [x, z] of [
      [-0.62, -0.7],
      [0.62, -0.7],
      [-0.62, 0.8],
      [0.62, 0.8],
    ]) {
      const wheel = cyl(0.3, 0.3, 0.22, wheelMat, 18);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.3, z);
      bodyGroup.add(wheel);
    }
    // Mast + forks.
    const mast = box(0.12, 2.3, 0.12, cageMat);
    const mast2 = mast.clone();
    mast.position.set(-0.4, 1.15, -1.12);
    mast2.position.set(0.4, 1.15, -1.12);
    bodyGroup.add(mast, mast2);
    const forkY = raised ? 1.45 : 0.1;
    const forkMat = std(0x8d939b, { metalness: 0.55, roughness: 0.35 });
    for (const x of [-0.35, 0.35]) {
      const heel = box(0.14, 0.5, 0.1, forkMat);
      heel.position.set(x, forkY + 0.25, -1.2);
      bodyGroup.add(heel);
      const tine = box(0.14, 0.06, 1.1, forkMat);
      tine.position.set(x, forkY, -1.78);
      bodyGroup.add(tine);
    }
    // Rotating amber beacon.
    const beaconBase = cyl(0.07, 0.09, 0.08, std(0x2c2e33));
    beaconBase.position.set(0, 2.27, 0.05);
    bodyGroup.add(beaconBase);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xff9d1e,
      emissive: 0xff8a00,
      emissiveIntensity: 1.6,
      transparent: true,
      opacity: 0.92,
    });
    beaconMat.userData['noShimmer'] = true;
    const beacon = cyl(0.05, 0.06, 0.12, beaconMat, 10);
    beacon.position.set(0, 2.37, 0.05);
    bodyGroup.add(beacon);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffa53e,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    beamMat.userData['noShimmer'] = true;
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.1), beamMat);
    beam.position.set(0.45, 2.37, 0.05);
    const beamPivot = new THREE.Group();
    beamPivot.position.set(0, 0, 0);
    beamPivot.add(beam);
    beam.position.set(0.45, 0, 0);
    beamPivot.position.set(0, 2.37, 0.05);
    bodyGroup.add(beamPivot);
    const beaconLight = new THREE.PointLight(0xff9d1e, 4, 7, 2);
    beaconLight.position.set(0, 2.5, 0.05);
    bodyGroup.add(beaconLight);
    g.add(bodyGroup);

    // Idle engine bob + spinning beacon.
    this.animators.push((dt, t) => {
      bodyGroup.position.y = Math.sin(t * 7.3) * 0.012;
      beamPivot.rotation.y = t * 4.2;
      beaconLight.intensity = 3 + Math.sin(t * 4.2) * 1.6;
    });
    return g;
  }

  private buildDrum(label: string | null, color: number): THREE.Group {
    const g = new THREE.Group();
    const body = cyl(0.32, 0.32, 0.92, std(color, { roughness: 0.45 }), 20);
    body.position.y = 0.46;
    g.add(body);
    for (const y of [0.18, 0.5, 0.8]) {
      const rib = cyl(0.335, 0.335, 0.03, std(color, { roughness: 0.4 }), 20);
      rib.position.y = y;
      g.add(rib);
    }
    if (label) {
      const tag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.3),
        new THREE.MeshStandardMaterial({
          map: signTexture([label, 'CORROSIVE'], {
            bg: '#ffffff',
            fg: '#111111',
            border: '#c01818',
            fontPx: 30,
          }),
        }),
      );
      tag.position.set(0, 0.5, 0.325);
      g.add(tag);
    }
    return g;
  }

  private buildLadder(damaged: boolean): THREE.Group {
    const g = new THREE.Group();
    const railMat = std(damaged ? 0xb8b23a : 0xd8d23e, { roughness: 0.5 });
    const lean = -0.32;
    for (const x of [-0.28, 0.28]) {
      const rail = box(0.06, 2.6, 0.07, railMat);
      rail.position.set(x, 1.28, 0);
      rail.rotation.x = lean;
      g.add(rail);
    }
    for (let i = 0; i < 6; i++) {
      const y = 0.3 + i * 0.42;
      const rung = box(0.5, 0.05, 0.07, railMat);
      rung.position.set(0, y, -Math.tan(lean) * (y - 1.28) * -1);
      rung.rotation.x = lean;
      if (damaged && i === 2) {
        // Split rung hanging by one side.
        rung.rotation.z = 0.5;
        rung.position.x = 0.1;
        rung.position.y -= 0.06;
      }
      g.add(rung);
    }
    return g;
  }

  private buildMannequin(withPpe: boolean): THREE.Group {
    const g = new THREE.Group();
    const skin = std(0xd9b18c);
    const torsoMat = withPpe
      ? std(0xd8ff2e, { emissive: 0x9ab800, emissiveIntensity: 0.25 })
      : std(0x5a6470);
    if (withPpe) torsoMat.userData['noShimmer'] = true;
    const legs = box(0.34, 0.8, 0.22, std(0x394150));
    legs.position.y = 0.4;
    g.add(legs);
    const torso = box(0.44, 0.62, 0.26, torsoMat);
    torso.position.y = 1.12;
    g.add(torso);
    for (const x of [-0.29, 0.29]) {
      const arm = box(0.11, 0.55, 0.13, std(0x49525f));
      arm.position.set(x, 1.15, 0);
      arm.rotation.z = x > 0 ? -0.18 : 0.18;
      g.add(arm);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), skin);
    head.position.y = 1.6;
    head.castShadow = true;
    g.add(head);
    if (withPpe) {
      const hatMat = std(0xffd200, { roughness: 0.35 });
      hatMat.userData['noShimmer'] = true;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        hatMat,
      );
      dome.position.y = 1.66;
      g.add(dome);
      const brim = cyl(0.21, 0.21, 0.025, hatMat, 18);
      brim.position.y = 1.665;
      g.add(brim);
    }
    return g;
  }

  private buildConveyor(unguarded: boolean): THREE.Group {
    const g = new THREE.Group();
    const frameMat = std(0x39424d, { metalness: 0.3 });
    const frame = box(3.4, 0.12, 0.8, frameMat);
    frame.position.y = 0.75;
    g.add(frame);
    for (const x of [-1.5, 1.5]) {
      for (const z of [-0.3, 0.3]) {
        const leg = box(0.08, 0.72, 0.08, frameMat);
        leg.position.set(x, 0.37, z);
        g.add(leg);
      }
    }
    const rollMat = std(0xb9bec6, { metalness: 0.55, roughness: 0.3 });
    for (let i = 0; i < 9; i++) {
      const roller = cyl(0.06, 0.06, 0.72, rollMat, 12);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(-1.5 + i * 0.375, 0.85, 0);
      g.add(roller);
    }
    // Chain drive at one end — guard removed (hazard) or guarded (decoy).
    const sprocket = cyl(0.16, 0.16, 0.07, std(0x14161a, { metalness: 0.5 }), 14);
    sprocket.rotation.x = Math.PI / 2;
    sprocket.position.set(-1.62, 0.55, 0.42);
    g.add(sprocket);
    const chain = box(0.06, 0.5, 0.05, std(0x1d2025, { metalness: 0.6 }));
    chain.position.set(-1.62, 0.72, 0.42);
    g.add(chain);
    this.animators.push((dt, t) => {
      sprocket.rotation.y = t * 5;
    });
    if (!unguarded) {
      const guard = box(0.5, 0.7, 0.16, std(0xe8a013));
      guard.position.set(-1.62, 0.6, 0.44);
      g.add(guard);
    } else {
      // The guard, leaning against a leg on the floor.
      const offGuard = box(0.5, 0.7, 0.05, std(0xe8a013));
      offGuard.position.set(-2.0, 0.36, 0.1);
      offGuard.rotation.z = 0.5;
      g.add(offGuard);
    }
    return g;
  }

  private buildJunctionBox(damaged: boolean): THREE.Group {
    const g = new THREE.Group();
    const panel = box(0.5, 0.7, 0.16, std(0x7d858f, { metalness: 0.4 }));
    panel.position.y = 1.5;
    g.add(panel);
    const conduit = cyl(0.035, 0.035, 1.4, std(0x9aa1a9, { metalness: 0.5 }));
    conduit.position.set(0, 2.55, 0);
    g.add(conduit);
    if (damaged) {
      // Door hanging open, wires dangling.
      const door = box(0.46, 0.62, 0.03, std(0x7d858f, { metalness: 0.4 }));
      door.position.set(0.34, 1.32, 0.18);
      door.rotation.y = 1.2;
      g.add(door);
      g.add(
        wire(
          new THREE.Vector3(-0.1, 1.35, 0.1),
          new THREE.Vector3(-0.25, 0.65, 0.3),
          0.18,
          0x202024,
        ),
      );
      g.add(
        wire(new THREE.Vector3(0.05, 1.3, 0.1), new THREE.Vector3(0.3, 0.7, 0.35), 0.22, 0xb02020),
      );
      const copperMat = std(0xd99a3d, {
        metalness: 0.8,
        roughness: 0.3,
        emissive: 0x804400,
        emissiveIntensity: 0.3,
      });
      const tip = cyl(0.012, 0.012, 0.1, copperMat, 6);
      tip.position.set(-0.25, 0.6, 0.3);
      g.add(tip);
    } else {
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.2),
        new THREE.MeshStandardMaterial({
          map: signTexture(['DANGER', '480V'], {
            bg: '#c01818',
            fg: '#ffffff',
            fontPx: 34,
          }),
        }),
      );
      label.position.set(0, 1.55, 0.085);
      g.add(label);
    }
    return g;
  }

  private buildWetFloor(withSign: boolean): THREE.Group {
    const g = new THREE.Group();
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 26),
      new THREE.MeshStandardMaterial({
        color: 0x55626e,
        roughness: 0.05,
        metalness: 0.65,
        transparent: true,
        opacity: 0.85,
      }),
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.y = 0.015;
    puddle.receiveShadow = true;
    g.add(puddle);
    const puddle2 = puddle.clone();
    puddle2.scale.setScalar(0.5);
    puddle2.position.set(1.0, 0.014, 0.5);
    g.add(puddle2);
    if (withSign) {
      const coneMat = new THREE.MeshStandardMaterial({
        map: signTexture(['WET', 'FLOOR'], {
          bg: '#f5c518',
          fg: '#111111',
          fontPx: 44,
        }),
        roughness: 0.6,
      });
      const sign = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.75, 4), coneMat);
      sign.position.set(0, 0.38, 0);
      sign.castShadow = true;
      g.add(sign);
    }
    return g;
  }

  private buildBrokenLight(): THREE.Group {
    const g = new THREE.Group();
    const fixture = box(1.8, 0.12, 0.5, std(0x4f545b));
    g.add(fixture);
    const flickerMat = new THREE.MeshStandardMaterial({
      color: 0xf4f7ff,
      emissive: 0xeef3ff,
      emissiveIntensity: 1.1,
    });
    flickerMat.userData['noShimmer'] = true;
    const tube = box(1.6, 0.06, 0.34, flickerMat);
    tube.position.y = -0.09;
    g.add(tube);
    // One end hangs loose with exposed wiring.
    const loose = box(0.5, 0.05, 0.3, flickerMat.clone());
    loose.position.set(0.9, -0.28, 0);
    loose.rotation.z = 0.45;
    g.add(loose);
    g.add(
      wire(new THREE.Vector3(0.75, -0.05, 0), new THREE.Vector3(1.0, -0.35, 0.05), 0.06, 0x202024),
    );
    const light = new THREE.PointLight(0xeef3ff, 9, 11, 1.9);
    light.position.y = -0.3;
    g.add(light);
    const fl: FlickerLight = { light, mat: flickerMat, t: 0 };
    this.animators.push((dt) => {
      fl.t -= dt;
      if (fl.t <= 0) {
        fl.t = 0.04 + Math.random() * 0.22;
        const on = Math.random() > 0.42;
        fl.light.intensity = on ? 6 + Math.random() * 6 : 0.4;
        fl.mat.emissiveIntensity = on ? 0.9 + Math.random() * 0.5 : 0.06;
      }
    });
    return g;
  }

  // -- tool shop builders --------------------------------------------------

  private buildWorkbench(length = 2.4): THREE.Group {
    const g = new THREE.Group();
    const top = box(length, 0.09, 0.85, std(0x9c7a4a, { roughness: 0.7 }));
    top.position.y = 0.92;
    g.add(top);
    const legMat = std(0x3c424b, { metalness: 0.3 });
    for (const x of [-length / 2 + 0.12, length / 2 - 0.12]) {
      for (const z of [-0.32, 0.32]) {
        const leg = box(0.08, 0.9, 0.08, legMat);
        leg.position.set(x, 0.45, z);
        g.add(leg);
      }
    }
    const shelf = box(length - 0.2, 0.05, 0.7, legMat);
    shelf.position.y = 0.28;
    g.add(shelf);
    return g;
  }

  private buildGrinder(guarded: boolean): THREE.Group {
    const g = new THREE.Group();
    const pedestal = cyl(0.09, 0.14, 0.95, std(0x39414c, { metalness: 0.35 }));
    pedestal.position.y = 0.48;
    g.add(pedestal);
    const motor = box(0.4, 0.26, 0.26, std(0x2e6b35, { roughness: 0.4 }));
    motor.position.y = 1.05;
    g.add(motor);
    const wheelMat = std(0x9a9489, { roughness: 0.95 });
    const wheels: THREE.Mesh[] = [];
    for (const x of [-0.3, 0.3]) {
      const wheel = cyl(0.17, 0.17, 0.05, wheelMat, 22);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 1.05, 0);
      g.add(wheel);
      wheels.push(wheel);
    }
    this.animators.push((dt, t) => {
      for (const w of wheels) w.rotation.y = t * 18;
    });
    if (guarded) {
      const guardMat = std(0x2e6b35, { roughness: 0.4 });
      for (const x of [-0.3, 0.3]) {
        const shell = box(0.1, 0.28, 0.3, guardMat);
        shell.position.set(x, 1.16, -0.05);
        g.add(shell);
        const rest = box(0.12, 0.02, 0.1, std(0x9aa1a9, { metalness: 0.5 }));
        rest.position.set(x, 0.98, 0.16);
        g.add(rest);
      }
      const shieldMat = new THREE.MeshStandardMaterial({
        color: 0xbfd8e8,
        transparent: true,
        opacity: 0.4,
        roughness: 0.1,
      });
      shieldMat.userData['noShimmer'] = true;
      for (const x of [-0.3, 0.3]) {
        const shield = box(0.18, 0.14, 0.02, shieldMat);
        shield.position.set(x, 1.22, 0.18);
        shield.rotation.x = -0.5;
        g.add(shield);
      }
    }
    return g;
  }

  private buildDrillPress(keyInChuck: boolean): THREE.Group {
    const g = new THREE.Group();
    const base = box(0.55, 0.08, 0.45, std(0x32383f, { metalness: 0.4 }));
    base.position.y = 0.96;
    g.add(base);
    const column = cyl(0.045, 0.045, 1.0, std(0x6f7780, { metalness: 0.5 }));
    column.position.set(0, 1.46, -0.14);
    g.add(column);
    const head = box(0.5, 0.26, 0.3, std(0x2a5d8f, { roughness: 0.45 }));
    head.position.set(0, 1.95, 0);
    g.add(head);
    const table = box(0.34, 0.04, 0.3, std(0x49515a, { metalness: 0.35 }));
    table.position.set(0, 1.35, 0.04);
    g.add(table);
    const chuck = cyl(0.045, 0.06, 0.16, std(0xb6bcc4, { metalness: 0.65 }), 12);
    chuck.position.set(0, 1.74, 0.04);
    g.add(chuck);
    if (keyInChuck) {
      const key = box(0.03, 0.03, 0.16, std(0xc8ccd2, { metalness: 0.7 }));
      key.position.set(0.07, 1.72, 0.1);
      key.rotation.y = 0.6;
      g.add(key);
    }
    return g;
  }

  private buildCompressor(beltGuarded: boolean): THREE.Group {
    const g = new THREE.Group();
    const tank = cyl(0.3, 0.3, 1.3, std(0x2554a0, { roughness: 0.4 }), 18);
    tank.rotation.z = Math.PI / 2;
    tank.position.y = 0.55;
    g.add(tank);
    for (const x of [-0.45, 0.45]) {
      const foot = box(0.1, 0.26, 0.4, std(0x222831));
      foot.position.set(x, 0.13, 0);
      g.add(foot);
    }
    const motor = box(0.34, 0.3, 0.3, std(0x33383f, { metalness: 0.35 }));
    motor.position.set(-0.25, 1.0, 0);
    g.add(motor);
    const bigPulley = cyl(0.18, 0.18, 0.05, std(0x14161a, { metalness: 0.5 }), 18);
    bigPulley.rotation.x = Math.PI / 2;
    bigPulley.position.set(0.25, 1.0, 0.2);
    g.add(bigPulley);
    const smallPulley = cyl(0.07, 0.07, 0.05, std(0x14161a, { metalness: 0.5 }), 14);
    smallPulley.rotation.x = Math.PI / 2;
    smallPulley.position.set(-0.25, 1.0, 0.2);
    g.add(smallPulley);
    const belt = box(0.55, 0.18, 0.02, std(0x1d2025, { roughness: 0.9 }));
    belt.position.set(0, 1.0, 0.21);
    g.add(belt);
    this.animators.push((dt, t) => {
      bigPulley.rotation.y = t * 6;
      smallPulley.rotation.y = t * 15;
    });
    if (beltGuarded) {
      const guard = box(0.75, 0.5, 0.1, std(0xe8a013));
      guard.position.set(0, 1.0, 0.26);
      g.add(guard);
    }
    return g;
  }

  private buildFlammablesCabinet(): THREE.Group {
    const g = new THREE.Group();
    const cab = box(0.9, 1.5, 0.5, std(0xf5c518, { roughness: 0.45 }));
    cab.position.y = 0.75;
    g.add(cab);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.5),
      new THREE.MeshStandardMaterial({
        map: signTexture(['FLAMMABLE', 'KEEP FIRE AWAY'], {
          bg: '#f5c518',
          fg: '#a01010',
          border: '#a01010',
          fontPx: 28,
        }),
      }),
    );
    label.position.set(0, 0.95, 0.255);
    g.add(label);
    return g;
  }

  private buildSolventCans(): THREE.Group {
    const g = new THREE.Group();
    const colors = [0xc01818, 0xc01818, 0xd97a1e];
    colors.forEach((c, i) => {
      const can = cyl(0.085, 0.085, 0.26, std(c, { roughness: 0.4, metalness: 0.3 }), 12);
      can.position.set(i * 0.22 - 0.2, 1.1, i % 2 === 0 ? 0 : 0.16);
      g.add(can);
      const spout = cyl(0.02, 0.02, 0.07, std(0x55585e, { metalness: 0.5 }), 8);
      spout.position.set(i * 0.22 - 0.2, 1.26, i % 2 === 0 ? 0 : 0.16);
      g.add(spout);
    });
    // Spill sheen on the bench.
    const spill = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 16),
      new THREE.MeshStandardMaterial({
        color: 0x6e6452,
        roughness: 0.1,
        metalness: 0.4,
        transparent: true,
        opacity: 0.7,
      }),
    );
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(0.1, 0.975, 0.1);
    g.add(spill);
    return g;
  }

  private buildDaisyChain(): THREE.Group {
    const g = new THREE.Group();
    const stripMat = std(0xe5e2da, { roughness: 0.5 });
    const positions: Array<[number, number]> = [
      [-1.2, 0],
      [0, 0.5],
      [1.2, 0.1],
    ];
    for (const [x, z] of positions) {
      const strip = box(0.34, 0.05, 0.13, stripMat);
      strip.position.set(x, 0.03, z);
      strip.rotation.y = Math.random() * 0.8;
      g.add(strip);
    }
    g.add(
      wire(
        new THREE.Vector3(-1.05, 0.04, 0),
        new THREE.Vector3(-0.16, 0.04, 0.48),
        -0.02,
        0xd9742c,
      ),
    );
    g.add(
      wire(
        new THREE.Vector3(0.16, 0.04, 0.5),
        new THREE.Vector3(1.05, 0.04, 0.12),
        -0.02,
        0x202024,
      ),
    );
    g.add(
      wire(new THREE.Vector3(1.35, 0.04, 0.1), new THREE.Vector3(2.4, 0.9, -0.4), 0.3, 0xd9742c),
    );
    // Frayed section — exposed copper.
    const copper = cyl(0.012, 0.012, 0.12, std(0xd99a3d, { metalness: 0.8, roughness: 0.3 }), 6);
    copper.rotation.z = Math.PI / 2;
    copper.position.set(0.6, 0.045, 0.32);
    g.add(copper);
    return g;
  }

  private buildTableSawNoLoto(): THREE.Group {
    const g = new THREE.Group();
    const body = box(1.0, 0.85, 0.9, std(0x4b5560, { metalness: 0.25 }));
    body.position.y = 0.43;
    g.add(body);
    const top = box(1.15, 0.05, 1.0, std(0xaab1ba, { metalness: 0.55, roughness: 0.3 }));
    top.position.y = 0.88;
    g.add(top);
    const blade = cyl(0.16, 0.16, 0.01, std(0xd2d7dd, { metalness: 0.8, roughness: 0.25 }), 24);
    blade.rotation.z = Math.PI / 2;
    blade.position.y = 0.97;
    g.add(blade);
    // Access panel off, leaning against the saw; tools on the floor.
    const panel = box(0.45, 0.5, 0.03, std(0x4b5560, { metalness: 0.25 }));
    panel.position.set(0.75, 0.26, 0.2);
    panel.rotation.z = 0.35;
    g.add(panel);
    const toolbox = box(0.4, 0.16, 0.2, std(0xc01818, { roughness: 0.4 }));
    toolbox.position.set(0.5, 0.08, 0.62);
    g.add(toolbox);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.3),
      new THREE.MeshStandardMaterial({
        map: signTexture(['UNDER', 'SERVICE'], {
          bg: '#ffffff',
          fg: '#1a1a1a',
          border: '#da7b11',
          fontPx: 36,
        }),
      }),
    );
    sign.position.set(0, 0.55, 0.47);
    g.add(sign);
    return g;
  }

  private buildPanelWithCart(blocked: boolean): THREE.Group {
    const g = new THREE.Group();
    const panel = box(0.7, 1.0, 0.12, std(0x7d858f, { metalness: 0.4 }));
    panel.position.y = 1.5;
    g.add(panel);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.24),
      new THREE.MeshStandardMaterial({
        map: signTexture(['ELECTRICAL', 'PANEL B'], {
          bg: '#ffffff',
          fg: '#111111',
          border: '#1473e6',
          fontPx: 26,
        }),
      }),
    );
    label.position.set(0, 2.12, 0.07);
    g.add(label);
    if (blocked) {
      const cart = new THREE.Group();
      const bed = box(0.95, 0.07, 0.6, std(0x39414c, { metalness: 0.35 }));
      bed.position.y = 0.5;
      cart.add(bed);
      const lower = box(0.95, 0.07, 0.6, std(0x39414c, { metalness: 0.35 }));
      lower.position.y = 0.18;
      cart.add(lower);
      for (const [x, z] of [
        [-0.42, -0.25],
        [0.42, -0.25],
        [-0.42, 0.25],
        [0.42, 0.25],
      ]) {
        const post = box(0.05, 0.55, 0.05, std(0x2a2f36));
        post.position.set(x, 0.33, z);
        cart.add(post);
      }
      const bin1 = box(0.4, 0.25, 0.4, std(0x2554a0));
      bin1.position.set(-0.2, 0.66, 0);
      cart.add(bin1);
      const bin2 = box(0.35, 0.22, 0.35, std(0xc01818));
      bin2.position.set(0.25, 0.65, 0.05);
      cart.add(bin2);
      cart.position.set(0, 0, 0.55);
      g.add(cart);
    }
    return g;
  }

  private buildRagBin(): THREE.Group {
    const g = new THREE.Group();
    const bin = box(0.55, 0.4, 0.55, this.cardboard());
    bin.position.y = 0.2;
    g.add(bin);
    const ragMat = std(0x6e6452, { roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const rag = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), ragMat);
      rag.scale.y = 0.5;
      rag.position.set(
        (Math.random() - 0.5) * 0.34,
        0.42 + Math.random() * 0.1,
        (Math.random() - 0.5) * 0.34,
      );
      rag.castShadow = true;
      g.add(rag);
    }
    // Space heater glowing beside it.
    const heater = box(0.35, 0.5, 0.22, std(0x55585e, { metalness: 0.3 }));
    heater.position.set(0.62, 0.25, 0);
    g.add(heater);
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xff5a1e,
      emissive: 0xff3c00,
      emissiveIntensity: 1.4,
    });
    glowMat.userData['noShimmer'] = true;
    const coil = box(0.26, 0.34, 0.02, glowMat);
    coil.position.set(0.62, 0.27, -0.115);
    g.add(coil);
    const heatLight = new THREE.PointLight(0xff5a1e, 2.5, 3.5, 2);
    heatLight.position.set(0.62, 0.3, -0.3);
    g.add(heatLight);
    this.animators.push((dt, t) => {
      heatLight.intensity = 2.2 + Math.sin(t * 9) * 0.5;
    });
    return g;
  }

  private buildGasCylinders(secured: boolean): THREE.Group {
    const g = new THREE.Group();
    const colors = secured ? [0x2e6b35, 0x2554a0] : [0x2554a0];
    colors.forEach((c, i) => {
      const body = cyl(0.14, 0.14, 1.4, std(c, { roughness: 0.35 }), 16);
      body.position.set(i * 0.34, 0.7, 0);
      g.add(body);
      const valve = cyl(0.04, 0.04, 0.14, std(0xb6bcc4, { metalness: 0.6 }), 10);
      valve.position.set(i * 0.34, 1.47, 0);
      g.add(valve);
    });
    if (secured) {
      const rack = box(0.85, 0.07, 0.1, std(0x39414c, { metalness: 0.4 }));
      rack.position.set(0.17, 1.0, -0.16);
      g.add(rack);
      const chain = box(0.8, 0.035, 0.03, std(0x9aa1a9, { metalness: 0.6 }));
      chain.position.set(0.17, 0.95, 0.13);
      g.add(chain);
    } else {
      // Free-standing and visibly off-vertical.
      g.rotation.z = 0.06;
    }
    return g;
  }

  private buildAirStation(): THREE.Group {
    const g = new THREE.Group();
    const bench = this.buildWorkbench(1.6);
    g.add(bench);
    const reel = cyl(0.16, 0.16, 0.1, std(0xd97a1e, { roughness: 0.4 }), 16);
    reel.rotation.x = Math.PI / 2;
    reel.position.set(0, 1.6, -0.35);
    g.add(reel);
    g.add(wire(new THREE.Vector3(0, 1.5, -0.3), new THREE.Vector3(0.4, 1.0, 0.2), 0.25, 0xd92c2c));
    // Blow gun on the bench.
    const gun = box(0.06, 0.05, 0.2, std(0x2a2f36, { metalness: 0.4 }));
    gun.position.set(0.42, 0.99, 0.22);
    g.add(gun);
    const nozzle = cyl(0.012, 0.02, 0.1, std(0xb6bcc4, { metalness: 0.7 }), 8);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0.42, 0.99, 0.36);
    g.add(nozzle);
    const gauge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.22),
      new THREE.MeshStandardMaterial({
        map: signTexture(['LINE: 90 PSI'], {
          bg: '#ffffff',
          fg: '#a01010',
          border: '#a01010',
          fontPx: 32,
        }),
      }),
    );
    gauge.position.set(-0.4, 1.45, -0.41);
    g.add(gauge);
    // Chip pile being "cleaned".
    const chips = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 12),
      std(0x8d939b, { metalness: 0.5, roughness: 0.6 }),
    );
    chips.rotation.x = -Math.PI / 2;
    chips.position.set(0.1, 0.975, 0.15);
    g.add(chips);
    return g;
  }

  private buildEyeStation(empty: boolean): THREE.Group {
    const g = new THREE.Group();
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.45),
      new THREE.MeshStandardMaterial({
        map: signTexture(['EYE PROTECTION', 'REQUIRED'], {
          bg: '#1473e6',
          fg: '#ffffff',
          border: '#ffffff',
          fontPx: 26,
        }),
      }),
    );
    sign.position.set(0.04, 1.9, 0);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
    const dispenser = box(0.12, 0.5, 0.34, std(0xe5e2da, { roughness: 0.5 }));
    dispenser.position.set(0.08, 1.35, 0);
    g.add(dispenser);
    const slot = box(0.06, 0.36, 0.24, std(0x17181a));
    slot.position.set(0.13, 1.35, 0);
    g.add(slot);
    if (!empty) {
      const glasses = box(0.05, 0.05, 0.2, std(0xbfd8e8, { roughness: 0.2 }));
      glasses.position.set(0.14, 1.18, 0);
      g.add(glasses);
    }
    return g;
  }

  // -- level dressing ----------------------------------------------------------

  private buildWarehouseDressing(root: THREE.Group): void {
    // Shelving rows (compliant — decoys).
    this.addProp(root, this.buildShelvingRack(), [-6, 0, -2.2], {
      collide: true,
      inspectable: true,
      propName: 'storage rack',
    });
    this.addProp(root, this.buildShelvingRack(), [-6, 0, 4.4], {
      collide: true,
      inspectable: true,
      propName: 'storage rack',
    });
    this.addProp(root, this.buildShelvingRack(), [6, 0, -2.2], {
      collide: true,
      inspectable: true,
      propName: 'storage rack',
    });
    this.addProp(root, this.buildShelvingRack(), [6, 0, 4.4], {
      collide: true,
      inspectable: true,
      propName: 'storage rack',
    });

    // Tidy pallets & stacks (decoys).
    const tidy1 = new THREE.Group();
    tidy1.add(this.buildPallet());
    const tidyStack = this.buildBoxStack(true);
    tidyStack.position.y = 0.16;
    tidy1.add(tidyStack);
    this.addProp(root, tidy1, [-10, 0, -7], {
      collide: true,
      inspectable: true,
      propName: 'palletized stock',
    });
    const tidy2 = new THREE.Group();
    tidy2.add(this.buildPallet());
    const tidyStack2 = this.buildBoxStack(true);
    tidyStack2.position.y = 0.16;
    tidy2.add(tidyStack2);
    this.addProp(
      root,
      tidy2,
      [12.5, 0, 8],
      { collide: true, inspectable: true, propName: 'palletized stock' },
      0.4,
    );

    // Compliant exit on the east wall (decoy).
    this.addProp(
      root,
      this.buildExitDoor(false),
      [14.45, 0, -6],
      { inspectable: true, propName: 'emergency exit' },
      Math.PI,
    );

    // Compliant extinguisher near spawn (decoy).
    this.addProp(
      root,
      this.buildExtinguisher(false),
      [-14.45, 0, 8],
      { inspectable: true, propName: 'fire extinguisher station' },
      Math.PI,
    );

    // Labeled drums (decoys) next to where the unlabeled one will sit.
    this.addProp(root, this.buildDrum('ACID', 0x2e6b35), [9.3, 0, -9.6], {
      collide: true,
      inspectable: true,
      propName: 'labeled chemical drum',
    });
    this.addProp(root, this.buildDrum('SOAP', 0x2554a0), [9.9, 0, -10.4], {
      collide: true,
      inspectable: true,
      propName: 'labeled chemical drum',
    });

    // Compliant worker with PPE (decoy).
    this.addProp(
      root,
      this.buildMannequin(true),
      [4, 0, 3],
      { collide: true, inspectable: true, propName: 'worker (PPE on)' },
      -0.7,
    );

    // Wet floor WITH signage (decoy) near the dock.
    this.addProp(root, this.buildWetFloor(true), [-9, 0, -10], {
      inspectable: true,
      propName: 'mopped area (signed)',
    });

    // Dock door (environment dressing).
    const dock = new THREE.Group();
    const dockDoor = box(4.6, 4.2, 0.16, std(0x6a7280, { metalness: 0.3 }));
    dockDoor.position.y = 2.1;
    dock.add(dockDoor);
    for (let i = 0; i < 6; i++) {
      const rib = box(4.6, 0.05, 0.18, std(0x4d535c));
      rib.position.y = 0.5 + i * 0.7;
      dock.add(rib);
    }
    const dockStripe = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 0.5),
      new THREE.MeshStandardMaterial({ map: cautionTexture() }),
    );
    dockStripe.rotation.x = -Math.PI / 2;
    dockStripe.position.set(0, 0.013, 0.7);
    dock.add(dockStripe);
    this.addProp(root, dock, [0, 0, -11.9], {
      inspectable: true,
      propName: 'loading dock door',
    });
  }

  private buildToolshopDressing(root: THREE.Group): void {
    // Pegboard tool wall.
    const pegboard = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 2),
      new THREE.MeshStandardMaterial({ map: pegboardTexture(), roughness: 0.85 }),
    );
    pegboard.position.set(-3, 1.7, -7.93);
    pegboard.userData['environment'] = true;
    root.add(pegboard);

    // Benches along the north wall (the hazard stations sit on/near these).
    this.addProp(root, this.buildWorkbench(3.2), [-6.6, 0, -6.9], {
      collide: true,
      inspectable: true,
      propName: 'workbench',
    });
    this.addProp(root, this.buildWorkbench(3.2), [-2.2, 0, -6.9], {
      collide: true,
      inspectable: true,
      propName: 'workbench',
    });
    this.addProp(root, this.buildWorkbench(2.4), [3.4, 0, -6.9], {
      collide: true,
      inspectable: true,
      propName: 'workbench',
    });

    // Compliant guarded grinder (decoy).
    this.addProp(root, this.buildGrinder(true), [3.4, 0, -6.4], {
      inspectable: true,
      propName: 'bench grinder (guarded)',
    });

    // Flammables cabinet (compliant home for the loose solvents).
    this.addProp(
      root,
      this.buildFlammablesCabinet(),
      [-10.5, 0, -2],
      { collide: true, inspectable: true, propName: 'flammables cabinet' },
      Math.PI / 2,
    );

    // Secured gas cylinders (decoy) near the unsecured one.
    this.addProp(
      root,
      this.buildGasCylinders(true),
      [-10.4, 0, 5.2],
      { collide: true, inspectable: true, propName: 'secured gas cylinders' },
      Math.PI / 2,
    );

    // Stocked eye-protection station (decoy) by the door.
    this.addProp(
      root,
      this.buildEyeStation(false),
      [10.85, 0, -3],
      { inspectable: true, propName: 'PPE dispenser (stocked)' },
      Math.PI,
    );

    // Central bench island.
    this.addProp(
      root,
      this.buildWorkbench(2.8),
      [-2, 0, 1.5],
      {
        collide: true,
        inspectable: true,
        propName: 'assembly bench',
      },
      Math.PI / 2,
    );

    // Stool & parts crates.
    const crate = box(0.6, 0.6, 0.6, this.cardboard());
    crate.position.y = 0.3;
    const crateGroup = new THREE.Group();
    crateGroup.add(crate);
    this.addProp(
      root,
      crateGroup,
      [-6, 0, 4.5],
      {
        collide: true,
        inspectable: true,
        propName: 'parts crate',
      },
      0.4,
    );

    const stool = new THREE.Group();
    const seat = cyl(0.18, 0.18, 0.05, std(0x9c7a4a), 14);
    seat.position.y = 0.62;
    stool.add(seat);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = cyl(0.02, 0.02, 0.62, std(0x39414c, { metalness: 0.4 }), 8);
      leg.position.set(Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12);
      leg.rotation.z = Math.cos(a) * 0.12;
      leg.rotation.x = -Math.sin(a) * 0.12;
      stool.add(leg);
    }
    this.addProp(root, stool, [0.5, 0, 2.6], {
      inspectable: true,
      propName: 'shop stool',
    });
  }

  // -- hazard construction ----------------------------------------------------

  private buildHazard(root: THREE.Group, hazard: HazardDef): void {
    let group: THREE.Group;
    let collide = true;
    switch (hazard.kind) {
      case 'blocked-exit':
        group = this.buildExitDoor(true);
        break;
      case 'wet-floor':
        group = this.buildWetFloor(false);
        collide = false;
        break;
      case 'unstable-stack': {
        group = new THREE.Group();
        group.add(this.buildPallet());
        const stack = this.buildBoxStack(false);
        stack.position.y = 0.16;
        group.add(stack);
        break;
      }
      case 'forklift-raised':
        group = this.buildForklift(true);
        break;
      case 'blocked-extinguisher':
        group = this.buildExtinguisher(true);
        break;
      case 'exposed-wiring':
        group = this.buildJunctionBox(true);
        break;
      case 'unguarded-conveyor':
        group = this.buildConveyor(true);
        break;
      case 'unlabeled-drum':
        group = this.buildDrum(null, 0x2554a0);
        break;
      case 'damaged-ladder':
        group = this.buildLadder(true);
        break;
      case 'missing-ppe':
        group = this.buildMannequin(false);
        break;
      case 'broken-light':
        group = this.buildBrokenLight();
        collide = false;
        break;
      case 'grinder-no-guard':
        group = this.buildGrinder(false);
        collide = false;
        break;
      case 'no-eye-protection':
        group = this.buildEyeStation(true);
        collide = false;
        break;
      case 'compressed-air':
        group = this.buildAirStation();
        break;
      case 'flammables-out':
        group = this.buildSolventCans();
        collide = false;
        break;
      case 'daisy-chain':
        group = this.buildDaisyChain();
        collide = false;
        break;
      case 'missing-loto':
        group = this.buildTableSawNoLoto();
        break;
      case 'unguarded-belt':
        group = this.buildCompressor(false);
        break;
      case 'drill-press':
        group = this.buildDrillPress(true);
        break;
      case 'blocked-panel':
        group = this.buildPanelWithCart(true);
        break;
      case 'oily-rags':
        group = this.buildRagBin();
        break;
      case 'unsecured-cylinder':
        group = this.buildGasCylinders(false);
        break;
    }
    this.addProp(
      root,
      group,
      hazard.position,
      {
        collide,
        inspectable: true,
        propName: hazard.name,
        hazardId: hazard.id,
      },
      hazard.rotationY ?? 0,
    );
    this.hazardGroups.set(hazard.id, group);
  }
}
