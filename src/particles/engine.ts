/*
 * Moteur de particules maison : sprites pré-rendus, rotation, vent, balancement et interaction douce avec le curseur.
 * Optimisé contre les saccades : résolution du canvas plafonnée, effacement par zones, pas de temps lissé.
 */
import type { ThemeKey } from "../types";

const TAU = Math.PI * 2;
const R = (a: number, b: number): number => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const hex = (c: string): [number, number, number] => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c: string, a: number): string => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };
const shade = (c: string, f: number): string => {
  const [r, g, b] = hex(c), t = f < 0 ? 0 : 255, q = Math.abs(f);
  return `rgb(${Math.round((t - r) * q + r)},${Math.round((t - g) * q + g)},${Math.round((t - b) * q + b)})`;
};

/* ---- Formes dessinées dans un carré 0..100 (sprites pré-rendus) ---- */
type ShapeName = "maple" | "oval" | "petal" | "snow" | "crystal" | "bubble";
const P_MAPLE = new Path2D("M50 4L58 22L72 14L68 34L88 30L78 46L94 54L68 62L72 76L54 70L54 96L46 96L46 70L28 76L32 62L6 54L22 46L12 30L32 34L28 14L42 22Z");
const P_OVAL = new Path2D("M50 3C86 24 90 70 50 94C10 70 14 24 50 3Z");
const P_PETAL = new Path2D("M50 16L43 3C31 7 25 26 28 46C31 68 42 86 50 98C58 86 69 68 72 46C75 26 69 7 57 3Z");
const lines = (g: CanvasRenderingContext2D, pts: number[]): void => { g.beginPath(); for (let i = 0; i < pts.length; i += 4) { g.moveTo(pts[i], pts[i + 1]); g.lineTo(pts[i + 2], pts[i + 3]); } g.stroke(); };
type Painter = (g: CanvasRenderingContext2D, c: string) => void;
const leaf = (path: Path2D, veins: number[]): Painter => (g, c) => {
  const gr = g.createLinearGradient(15, 10, 85, 95); gr.addColorStop(0, shade(c, .22)); gr.addColorStop(1, shade(c, -.22));
  g.lineJoin = "round"; g.lineCap = "round"; g.fillStyle = gr; g.strokeStyle = shade(c, -.3); g.lineWidth = 3; g.fill(path); g.stroke(path);
  g.strokeStyle = "rgba(50,20,5,.30)"; g.lineWidth = 1.6; lines(g, veins);
};
const DRAW: Record<ShapeName, Painter> = {
  maple: leaf(P_MAPLE, [50, 94, 50, 12, 50, 68, 16, 50, 50, 68, 84, 50, 50, 52, 30, 24, 50, 52, 70, 24]),
  oval: leaf(P_OVAL, [50, 98, 50, 10, 50, 72, 26, 52, 50, 72, 74, 52, 50, 48, 30, 30, 50, 48, 70, 30]),
  petal(g, c) {
    const gr = g.createLinearGradient(50, 98, 50, 3); gr.addColorStop(0, shade(c, -.1)); gr.addColorStop(1, shade(c, .4));
    g.fillStyle = gr; g.fill(P_PETAL);
    g.strokeStyle = "rgba(255,255,255,.4)"; g.lineWidth = 1.6; g.lineCap = "round"; lines(g, [50, 92, 50, 26]);
  },
  snow(g, c) { const gr = g.createRadialGradient(50, 50, 0, 50, 50, 48); gr.addColorStop(0, rgba(c, 1)); gr.addColorStop(.45, rgba(c, .7)); gr.addColorStop(1, rgba(c, 0)); g.fillStyle = gr; g.fillRect(0, 0, 100, 100); },
  crystal(g, c) {
    g.strokeStyle = c; g.lineWidth = 5; g.lineCap = "round";
    for (let i = 0; i < 6; i++) { g.save(); g.translate(50, 50); g.rotate(i * TAU / 6); lines(g, [0, 0, 0, -42, 0, -24, -9, -34, 0, -24, 9, -34]); g.restore(); }
  },
  bubble(g, c) {
    const gr = g.createRadialGradient(40, 38, 4, 50, 50, 46); gr.addColorStop(0, rgba(c, .05)); gr.addColorStop(.7, rgba(c, .15)); gr.addColorStop(1, rgba(c, .40));
    g.fillStyle = gr; g.beginPath(); g.arc(50, 50, 45, 0, TAU); g.fill();
    g.strokeStyle = rgba(c, .75); g.lineWidth = 2.6; g.stroke();
    g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 5; g.lineCap = "round"; g.beginPath(); g.arc(50, 50, 32, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
    g.fillStyle = "rgba(255,255,255,.7)"; g.beginPath(); g.ellipse(69, 70, 6, 3, -.7, 0, TAU); g.fill();
  }
};

/* ---- Couches de particules propres à chaque saison ---- */
interface Layer {
  shapes: ShapeName[]; colors: string[]; count: number; size: [number, number]; vy: [number, number]; vx: number; sway: number; gust: number; relax: number;
  spin: [number, number]; spinV: number; flip: number; pend: number; alpha: [number, number]; push: number; swipe: number; radius: number; kick: number;
  bySize?: boolean; squish?: number; flat?: boolean; fixed?: boolean;
}
export function themeLayers(key: ThemeKey, dark: boolean): Layer[] {
  switch (key) {
    case "winter": return [
      { shapes: ["snow"], colors: dark ? ["#FFFFFF", "#DDF4FA"] : ["#6FC3D8", "#8FD3E6", "#4FA9C4"], count: 70, size: [7, 18], vy: [34, 80], vx: 34, sway: 16, gust: 70, relax: 1.5, spin: [0, 0], spinV: 0, flip: 0, pend: 0, alpha: [.55, .95], push: 170, swipe: .8, radius: 170, kick: 0 },
      { shapes: ["crystal"], colors: dark ? ["#FFFFFF", "#BFEFF7"] : ["#2B86C5", "#3FA9C4", "#5FBBD6"], count: 14, size: [16, 30], vy: [30, 56], vx: 30, sway: 20, gust: 60, relax: 1.4, spin: [-.7, .7], spinV: .003, flip: 0, pend: 0, alpha: [.6, .95], push: 170, swipe: .7, radius: 170, kick: 2 }];
    case "spring": return [
      { shapes: ["petal"], colors: dark ? ["#F8A5C2", "#F6B8CF", "#FFC9DA", "#FFD9E6"] : ["#EF7FA6", "#F28DB2", "#F6A3C1", "#F9B4CC"], count: 34, size: [16, 30], vy: [30, 52], vx: 16, sway: 38, gust: 28, relax: 1.1, spin: [-2.1, 2.1], spinV: .006, flip: .18, pend: .5, alpha: [.82, .97], push: 180, swipe: .6, radius: 150, kick: 4 }];
    case "summer": return [
      { shapes: ["bubble"], colors: dark ? ["#BFE9FF", "#8FD3F4", "#9ADBB3", "#FFFFFF"] : ["#58B7E6", "#3FA9C4", "#3DAE7C", "#7CCBDD"], count: 24, size: [18, 46], vy: [-32, -80], bySize: true, vx: 0, sway: 22, gust: 8, relax: 1.0, spin: [0, 0], spinV: 0, flip: 0, pend: 0, squish: .06, alpha: [.75, 1], push: 200, swipe: .45, radius: 160, kick: 0 }];
    default: return [
      { shapes: ["maple", "oval"], colors: ["#D9641E", "#F2A03D", "#E8B730", "#B3261E", "#A0521D", "#C97B1E"], count: 24, size: [20, 38], vy: [44, 78], vx: 20, sway: 46, gust: 34, relax: 1.25, spin: [-1.3, 1.3], spinV: .004, flip: .28, pend: .55, alpha: [.82, .98], push: 190, swipe: .55, radius: 150, kick: 3 }];
  }
}

interface Particle {
  L: Layer; layer: number; shape: number; color: number;
  x: number; y: number; vx: number; vy: number; vyT: number; z: number; size: number; mass: number; alpha: number; fade: number;
  phase: number; freq: number; flip: number; flipSp: number; rot: number; baseSpin: number; spin: number; kickDir: number;
  px: number; py: number; pr: number;           // zone à effacer à l'image suivante
}
const PIXEL_BUDGET = 2_400_000;                 // le canvas plein écran est recomposé à chaque image : on plafonne ses pixels

/** Démarre les particules dans `host`. Retourne une fonction d'arrêt. */
export function startParticles(host: HTMLElement, key: ThemeKey, dark: boolean): () => void {
  const cv = document.createElement("canvas"); cv.style.cssText = "display:block;width:100%;height:100%"; host.appendChild(cv);
  const ctx = cv.getContext("2d"); if (!ctx) { cv.remove(); return () => undefined; }
  const g: CanvasRenderingContext2D = ctx;
  const layers = themeLayers(key, dark);
  let W = 0, H = 0, dpr = 1, sprites: HTMLCanvasElement[][][] = [], parts: Particle[] = [];
  let raf = 0, lastT = 0, time = 0, running = true, sdt = 1 / 60, needFull = true;
  const M = { x: 0, y: 0, vx: 0, vy: 0, active: false, t: 0 };

  const makeSprites = (): void => {
    sprites = layers.map(L => {
      const S = clamp(Math.ceil(L.size[1] * dpr * 1.15), 48, 256);
      return L.shapes.map(sh => L.colors.map(c => {
        const k = document.createElement("canvas"); k.width = k.height = S;
        const kg = k.getContext("2d")!; kg.scale(S / 100, S / 100); DRAW[sh](kg, c); return k;
      }));
    });
  };
  const spawn = (p: Particle, init: boolean): void => {
    const L = p.L;
    p.z = L.flat ? 1 : R(.55, 1);
    const base = R(L.size[0], L.size[1]), tn = (base - L.size[0]) / Math.max(1, L.size[1] - L.size[0]);
    p.size = base * (L.flat ? 1 : (.7 + .45 * p.z));
    p.shape = Math.floor(Math.random() * L.shapes.length); p.color = Math.floor(Math.random() * L.colors.length);
    p.vyT = (L.bySize ? L.vy[0] + (L.vy[1] - L.vy[0]) * tn : R(L.vy[0], L.vy[1])) * (L.flat ? 1 : (.6 + .5 * p.z));
    p.phase = R(0, TAU); p.freq = R(.8, 1.9); p.flip = R(0, TAU); p.flipSp = R(1.2, 3.2);
    p.rot = R(0, TAU); p.baseSpin = R(L.spin[0], L.spin[1]); p.spin = p.baseSpin; p.kickDir = Math.random() < .5 ? -1 : 1;
    p.mass = .6 + p.size / (L.flat ? 400 : 60);
    p.alpha = R(L.alpha[0], L.alpha[1]) * (L.flat ? 1 : (.65 + .35 * p.z));
    if (init) { p.x = R(0, W); p.y = R(0, H); p.fade = 1; p.vx = 0; p.vy = p.vyT; }
    else { p.x = R(-.05 * W, 1.05 * W); p.y = p.vyT < 0 ? H + p.size : -p.size; p.fade = 0; p.vx = 0; p.vy = p.vyT; }
  };
  const populate = (): void => {
    const scale = clamp(W * H / (1280 * 800), .5, 1.6);
    parts = [];
    layers.forEach((L, i) => {
      const n = L.fixed ? L.count : Math.round(L.count * scale);
      for (let j = 0; j < n; j++) {
        const p = { L, layer: i, px: 0, py: 0, pr: 0 } as Particle; spawn(p, true); parts.push(p);
      }
    });
  };
  const resize = (): void => {
    const nW = innerWidth, nH = innerHeight;
    const nd = Math.round(clamp(Math.min(devicePixelRatio || 1, 2, Math.sqrt(PIXEL_BUDGET / Math.max(1, nW * nH))), 1, 2) * 20) / 20;
    const redo = Math.abs(nd - dpr) > .001; dpr = nd;
    if (W > 0 && H > 0) parts.forEach(p => { p.x *= nW / W; p.y *= nH / H; });
    W = nW; H = nH; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); needFull = true;
    if (redo) makeSprites();
  };

  const step = (dt: number): void => {
    time += dt;
    const gust = Math.sin(time * .31) * .6 + Math.sin(time * .83 + 1.7) * .3 + Math.sin(time * .11 + .5) * .6;   // rafales lentes
    const decay = Math.exp(-dt * 7); M.vx *= decay; M.vy *= decay;
    const kSpin = 1 - Math.exp(-dt * 1.6), mSp = Math.hypot(M.vx, M.vy) / 600;
    for (let i = 0, n = parts.length; i < n; i++) {
      const p = parts[i], L = p.L, z = p.z;
      p.phase += dt * p.freq; p.flip += dt * p.flipSp;
      const k = 1 - Math.exp(-dt * L.relax);                        // 1. retour doux vers la vitesse naturelle
      const tx = (L.vx + gust * L.gust + Math.sin(p.phase) * L.sway) * (.55 + .5 * z);
      const ty = p.vyT + Math.cos(p.phase * .7) * (L.sway * .18);
      p.vx += (tx - p.vx) * k; p.vy += (ty - p.vy) * k;
      if (M.active) {                                               // 2. curseur : champ de force lissé + « coup de vent »
        const dx = p.x - M.x, dy = p.y - M.y, d2 = dx * dx + dy * dy, rr = L.radius * (.85 + .3 * z);
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1, t = 1 - d / rr, f = t * t * (3 - 2 * t), inv = 1 / p.mass;
          p.vx += dx / d * L.push * f * dt * inv; p.vy += dy / d * L.push * f * dt * inv;
          const sw = L.swipe * f * dt * 3.2 * inv;
          p.vx += clamp(M.vx, -1400, 1400) * sw; p.vy += clamp(M.vy, -1400, 1400) * sw;
          p.spin += f * dt * L.kick * p.kickDir * (.5 + mSp);
        }
      }
      const sp2 = p.vx * p.vx + p.vy * p.vy; if (sp2 > 211600) { const q = 460 / Math.sqrt(sp2); p.vx *= q; p.vy *= q; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.spin += (p.baseSpin + p.vx * L.spinV - p.spin) * kSpin;     // 3. rotation
      p.rot += p.spin * dt;
      if (p.fade < 1) p.fade = Math.min(1, p.fade + dt * 1.4);
      const m = p.size;                                             // 4. bouclage hors écran
      if (p.x > W + m) p.x = -m; else if (p.x < -m) p.x = W + m;
      if (p.vyT >= 0 ? p.y > H + m : p.y < -m) spawn(p, false);
    }
  };
  const draw = (): void => {
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    if (needFull) { g.clearRect(0, 0, cv.width, cv.height); needFull = false; }
    else for (let i = 0, n = parts.length; i < n; i++) { const p = parts[i]; if (p.pr) g.clearRect(p.px, p.py, p.pr, p.pr); }
    for (let i = 0, n = parts.length; i < n; i++) {
      const p = parts[i], L = p.L; let sx = 1, sy = 1, ang = p.rot;
      if (L.flip) sy = L.flip + (1 - L.flip) * Math.abs(Math.cos(p.flip));      // retournement 3D
      if (L.pend) ang += Math.sin(p.phase) * L.pend;                            // balancement en planant
      if (L.squish) { const q = Math.sin(p.phase * 1.7) * L.squish; sx = 1 + q; sy = 1 - q; }
      const a = Math.cos(ang), b = Math.sin(ang), s = p.size;
      g.globalAlpha = p.alpha * p.fade;
      g.setTransform(dpr * a * sx, dpr * b * sx, -dpr * b * sy, dpr * a * sy, dpr * p.x, dpr * p.y);
      g.drawImage(sprites[p.layer][p.shape][p.color], -s / 2, -s / 2, s, s);
      const h = s * .5 * Math.max(Math.abs(a * sx) + Math.abs(b * sy), Math.abs(b * sx) + Math.abs(a * sy)) * dpr + 3;
      p.px = Math.floor(dpr * p.x - h); p.py = Math.floor(dpr * p.y - h); p.pr = Math.ceil(h * 2) + 2;
    }
  };
  const frame = (t: number): void => {
    if (!running) return;
    const raw = Math.min(.1, Math.max(0, (t - lastT) / 1000)); lastT = t;
    sdt += (raw - sdt) * .3;                                        // lisse les images irrégulières : pas de « saut » visible
    step(Math.min(.04, sdt)); draw();
    raf = requestAnimationFrame(frame);
  };

  const onMove = (e: PointerEvent): void => {
    const t = performance.now();
    if (M.active) { const dt = Math.max(8, t - M.t) / 1000; M.vx += ((e.clientX - M.x) / dt - M.vx) * .35; M.vy += ((e.clientY - M.y) / dt - M.vy) * .35; }
    M.x = e.clientX; M.y = e.clientY; M.t = t; M.active = true;
  };
  const off = (): void => { M.active = false; };
  const onUp = (e: PointerEvent): void => { if (e.pointerType === "touch") M.active = false; };
  const onVis = (): void => { if (document.hidden) cancelAnimationFrame(raf); else if (running) { lastT = performance.now(); sdt = 1 / 60; raf = requestAnimationFrame(frame); } };
  addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("mouseleave", off); addEventListener("blur", off);
  addEventListener("pointerup", onUp, { passive: true });
  addEventListener("resize", resize); document.addEventListener("visibilitychange", onVis);

  resize(); makeSprites(); populate();
  lastT = performance.now(); raf = requestAnimationFrame(frame);

  return () => {
    running = false; cancelAnimationFrame(raf);
    removeEventListener("pointermove", onMove); document.removeEventListener("mouseleave", off); removeEventListener("blur", off);
    removeEventListener("pointerup", onUp); removeEventListener("resize", resize); document.removeEventListener("visibilitychange", onVis);
    cv.remove();
  };
}
