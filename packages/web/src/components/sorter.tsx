import { Shuffle, Volume2, VolumeX, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";

// The stage is drawn at a fixed size and scaled to fit, so every number below is in stage pixels.
const W = 880;
const H = 540;
const FW = 92;
const FH = 112;
const FY = 440;

type Mode = "mess" | "sort" | "sorted" | "reset";
type Point = { x: number; y: number };
type Pose = Point & { r: number; s: number; z: number; l: number };

const issues = [
  { id: "ENG-142", title: "Checkout times out", x: 200 },
  { id: "ENG-157", title: "Dark mode tokens", x: 440 },
  { id: "DES-31", title: "Onboarding flow", x: 680 },
] as const;
const [checkout, theme, onboard] = issues;

const tints: Record<string, string> = {
  css: "#7cc8f0",
  json: "#c9a86a",
  log: "#a29f96",
  md: "#8299ff",
  patch: "#3ccf8e",
  png: "#f2a5c0",
  txt: "#ede3c8",
};

// Hand-placed so the mess looks the same on the server and the client.
const loose = [
  { name: "repro.log", issue: checkout, x: 130, y: 120, r: -14 },
  { name: "plan.md", issue: theme, x: 300, y: 330, r: 9 },
  { name: "flow.png", issue: onboard, x: 520, y: 110, r: -6 },
  { name: "fix.patch", issue: checkout, x: 720, y: 290, r: 18 },
  { name: "tokens.css", issue: theme, x: 420, y: 210, r: -21 },
  { name: "copy.md", issue: onboard, x: 190, y: 400, r: 23 },
  { name: "trace.json", issue: checkout, x: 620, y: 420, r: -10 },
  { name: "contrast.png", issue: theme, x: 780, y: 120, r: 12 },
  { name: "interview.txt", issue: onboard, x: 330, y: 90, r: 5 },
  { name: "notes.md", issue: checkout, x: 520, y: 330, r: -27 },
];

const files = loose.map((f, i) => {
  const peers = loose.filter((g) => g.issue === f.issue);
  const off = peers.indexOf(f) - (peers.length - 1) / 2;
  const ext = f.name.split(".").pop() ?? "";
  return {
    ...f,
    ext,
    tint: tints[ext] ?? "#a29f96",
    k: issues.indexOf(f.issue),
    slot: { x: f.issue.x + off * 30, y: FY - 26, r: off * 6 },
    cloud: { x: 60 + f.x * 0.86, y: 84 + (f.y - 70) * 0.42, r: f.r * 0.4 },
    spin: i % 3 === 0 ? (i % 2 === 0 ? 1 : -1) : 0,
    bars: [92, 64 + ((i * 17) % 30), 80, 40 + ((i * 11) % 40)],
  };
});
type File = (typeof files)[number];

const folders = issues.map((issue) => ({
  ...issue,
  mine: files.flatMap((f, i) => (f.issue === issue ? [i] : [])),
}));
type Folder = (typeof folders)[number];

const sparks = files.flatMap((f, i) =>
  Array.from({ length: 6 }, (_, m) => ({
    i,
    x: f.slot.x,
    a: -Math.PI / 2 + (m - 2.5) * 0.45,
    v: 260 + (m % 3) * 50,
    c: ["#ede3c8", "#8299ff", "#3ccf8e"][m % 3],
  })),
);

// Timeline in milliseconds from the moment the button is pressed.
const fly = (i: number) => 1000 + i * 230;
const land = (i: number) => fly(i) + 760;
const leave = (i: number) => 120 + i * 45;
const last = land(files.length - 1);
const end = { sort: last + 1370, reset: 1550 };

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const out = (t: number) => 1 - (1 - t) ** 3;
const inout = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2);
const back = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const shrink = (t: number) => 2.70158 * t ** 3 - 1.70158 * t ** 2;
const hump = (t: number) => (t > 0 && t < 1 ? Math.sin(Math.PI * t) : 0);
const wobble = (ms: number) =>
  ms > 0 ? Math.exp(-ms / 160) * Math.sin(ms / 38) : 0;
const spring = (ms: number) =>
  ms > 0 ? 1 - Math.exp(-ms / 130) * Math.cos(ms / 72) : 0;
const wave = (k: number, t: number) =>
  hump((t - last - 750 - k * 90) / 380) * 16;
// Once everything is filed, the tidy row of folders drifts up to the middle of the stage.
const UP = 130;
const rise = (t: number) => out(clamp((t - last - 200) / 650)) * UP;

// Quadratic bezier that bows upward, so every flight is a little lob.
const arc = (a: Point, b: Point, lift: number, t: number) => {
  const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift };
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
};

const place = (p: Pose) =>
  `translate3d(${p.x - FW / 2}px, ${p.y - FH / 2}px, 0) rotate(${p.r}deg) scale(${p.s})`;

function sorting(f: File, i: number, t: number): Pose {
  // Startle, then gather near the top to make room for the folders.
  const hop = hump((t - i * 25) / 300);
  const g = back(clamp((t - 150 - i * 20) / 600));
  const rest = {
    x: mix(f.x, f.cloud.x, g),
    y: mix(f.y, f.cloud.y, g) - hop * 22,
    r: mix(f.r, f.cloud.r, g) + hop * (i % 2 === 0 ? -5 : 5),
    s: 1 + hop * 0.06,
    z: 30 + i,
    l: hop * 0.6,
  };
  const u = clamp((t - fly(i)) / 760);
  if (u === 0) return rest;
  const pick = out(clamp(u / 0.14));
  const travel = inout(clamp((u - 0.1) / 0.68));
  const drop = clamp((u - 0.78) / 0.22);
  const at = arc(rest, { x: f.slot.x, y: f.slot.y - 90 }, 150, travel);
  return {
    x: at.x,
    y: mix(at.y, f.slot.y, drop * drop) - wave(f.k, t) - rise(t),
    r:
      mix(rest.r, f.slot.r + f.spin * 360, out(travel)) +
      wobble(t - land(i)) * 5,
    s: mix(mix(mix(1, 1.14, pick), 0.72, travel), 0.6, drop),
    // Once it starts dropping it slides between the folder's back and front panels.
    z: drop > 0 ? 15 : 60,
    l: mix(pick, 0, drop),
  };
}

function resetting(f: File, i: number, t: number): Pose {
  const u = clamp((t - leave(i)) / 650);
  const travel = out(u);
  const from = { x: f.slot.x, y: f.slot.y - UP };
  const at = arc(from, f, 160, travel);
  return {
    x: at.x,
    y: at.y,
    r:
      mix(f.slot.r, f.r - f.spin * 360, travel) +
      wobble(t - leave(i) - 650) * 4,
    s: mix(0.6, 1, travel),
    z: u < 0.12 ? 15 : u < 1 ? 60 : 30 + i,
    l: hump(u),
  };
}

function pose(f: File, i: number, mode: Mode, t: number): Pose {
  if (mode === "sort") return sorting(f, i, t);
  if (mode === "reset") return resetting(f, i, t);
  if (mode === "sorted")
    return { ...f.slot, y: f.slot.y - UP, s: 0.6, z: 15, l: 0 };
  return { x: f.x, y: f.y, r: f.r, s: 1, z: 30 + i, l: 0 };
}

function shelf(f: Folder, k: number, mode: Mode, t: number) {
  if (mode === "mess") return { s: 0, open: 0, gulp: 0, y: 0, count: 0 };
  if (mode === "sorted")
    return { s: 1, open: 0, gulp: 0, y: UP, count: f.mine.length };
  if (mode === "sort")
    return {
      s: spring(t - 500 - k * 140),
      // The front flap swings open just before a file arrives and snaps shut after.
      open: Math.max(
        0,
        ...f.mine.map((i) => {
          const ms = t - land(i);
          return clamp((ms + 330) / 200) * clamp((140 - ms) / 180);
        }),
      ),
      gulp: f.mine.reduce((sum, i) => sum + wobble(t - land(i)), 0),
      y: wave(k, t) + rise(t),
      count: f.mine.filter((i) => t >= land(i)).length,
    };
  return {
    s: 1 - shrink(clamp((t - 1000 - k * 70) / 360)),
    open: clamp(t / 180) * clamp((1000 - t) / 200),
    gulp: f.mine.reduce((sum, i) => sum + wobble(t - leave(i)) * 0.6, 0),
    y: UP,
    count: f.mine.filter((i) => t < leave(i)).length,
  };
}

function tally(mode: Mode, t: number) {
  if (mode === "sort") return files.filter((_, i) => t >= land(i)).length;
  if (mode === "reset") return files.filter((_, i) => t < leave(i)).length;
  return mode === "sorted" ? files.length : 0;
}

// A soft synthesized pop, so the demo ships no audio files.
function blip(ctx: AudioContext, step: number, down: boolean) {
  const t = ctx.currentTime;
  const f = 523.25 * 2 ** (step / 12);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(down ? f : f * 0.6, t);
  osc.frequency.exponentialRampToValueAtTime(down ? f * 0.6 : f, t + 0.05);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.07, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.22);
}

const notes = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const key = "doket-sound-off";

export function Sorter() {
  const outer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const run = useRef<{ mode: Mode; at: number }>({ mode: "mess", at: 0 });
  const point = useRef({ x: 0, y: 0, on: false });
  const audio = useRef<AudioContext | null>(null);
  const quiet = useRef(false);
  const [phase, setPhase] = useState<Mode>("mess");
  const [done, setDone] = useState(0);
  const [scale, setScale] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    quiet.current = localStorage.getItem(key) === "1";
    setMuted(quiet.current);
    const el = outer.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / W);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const root = stage.current;
    const box = outer.current;
    if (!root || !box) return;
    const cards = [...root.querySelectorAll<HTMLElement>("[data-file]")];
    const backs = [...root.querySelectorAll<HTMLElement>("[data-back]")];
    const fronts = [...root.querySelectorAll<HTMLElement>("[data-front]")];
    const counts = [...root.querySelectorAll<HTMLElement>("[data-count]")];
    const dots = [...root.querySelectorAll<HTMLElement>("[data-dot]")];
    const nudges = files.map(() => ({ x: 0, y: 0, l: 0 }));
    const shown = folders.map(() => -1);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let calm = 1;
    let seen = true;
    let tallied = 0;
    let raf = 0;

    const frame = (now: number) => {
      raf = seen ? requestAnimationFrame(frame) : 0;
      const state = run.current;
      const t = now - state.at;
      if (state.mode === "sort" && t >= end.sort) {
        state.mode = "sorted";
        setPhase("sorted");
      }
      if (state.mode === "reset" && t >= end.reset) {
        state.mode = "mess";
        setPhase("mess");
      }
      const mode = state.mode;
      const sec = now / 1000;
      const p = point.current;
      calm += ((mode === "mess" && !reduced.matches ? 1 : 0) - calm) * 0.08;

      files.forEach((f, i) => {
        const el = cards[i];
        const n = nudges[i];
        if (!el || !n) return;
        const b = pose(f, i, mode, t);
        // Loose files shy away from the cursor.
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const near = mode === "mess" && p.on ? clamp(1 - d / 150) : 0;
        const push = near * near * 48;
        n.x += ((dx / d) * push - n.x) * 0.12;
        n.y += ((dy / d) * push - n.y) * 0.12;
        n.l += (near * 0.8 - n.l) * 0.12;
        el.style.transform = place({
          ...b,
          x: b.x + n.x,
          y: b.y + n.y + Math.sin(sec * 1.4 + i * 1.3) * 3 * calm,
          r: b.r + n.x * 0.12 + Math.sin(sec * 0.9 + i * 2.1) * 1.2 * calm,
          s: b.s + n.l * 0.04,
        });
        el.style.zIndex = String(b.z);
        el.style.setProperty("--l", (b.l + n.l).toFixed(3));
      });

      folders.forEach((f, k) => {
        const s = shelf(f, k, mode, t);
        const sx = s.s * (1 + s.gulp * 0.05);
        const sy = s.s * (1 - s.gulp * 0.07);
        const hide = s.s < 0.01 ? "0" : "1";
        const rear = backs[k];
        const lid = fronts[k];
        if (rear) {
          rear.style.transform = `translate3d(${f.x - 90}px, ${FY - 65 - s.y}px, 0) scale(${sx}, ${sy})`;
          rear.style.opacity = hide;
        }
        if (lid) {
          lid.style.transform = `translate3d(${f.x - 93}px, ${FY - 35 - s.y}px, 0) scale(${sx}, ${sy}) perspective(600px) rotateX(${-s.open * 40}deg)`;
          lid.style.opacity = hide;
        }
        const label = counts[k];
        if (label && shown[k] !== s.count) {
          shown[k] = s.count;
          label.textContent = `${s.count} ${s.count === 1 ? "file" : "files"}`;
        }
      });

      dots.forEach((el, d) => {
        const s = sparks[d];
        if (!s) return;
        const dt = mode === "sort" ? (t - land(s.i)) / 1000 : -1;
        if (dt <= 0 || dt >= 0.6) {
          el.style.opacity = "0";
          return;
        }
        const x = s.x + Math.cos(s.a) * s.v * dt;
        const y = FY - 40 - rise(t) + Math.sin(s.a) * s.v * dt + 450 * dt * dt;
        el.style.transform = `translate3d(${x - 3}px, ${y - 3}px, 0) scale(${1 - dt})`;
        el.style.opacity = String(1 - dt / 0.6);
      });

      const n = tally(mode, t);
      if (n !== tallied) {
        const ctx = audio.current;
        if (ctx && !quiet.current && !reduced.matches) {
          if (mode === "sort" && n > tallied)
            blip(ctx, notes[n - 1] ?? 0, false);
          if (mode === "reset" && n < tallied) blip(ctx, notes[n] ?? 0, true);
        }
        tallied = n;
        setDone(n);
      }
    };

    const obs = new IntersectionObserver(([entry]) => {
      seen = entry?.isIntersecting ?? false;
      if (seen && !raf) raf = requestAnimationFrame(frame);
    });
    obs.observe(box);
    raf = requestAnimationFrame(frame);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const go = () => {
    const mode = run.current.mode;
    if (mode === "sort" || mode === "reset") return;
    const next = mode === "mess" ? "sort" : "reset";
    if (!quiet.current && typeof AudioContext !== "undefined")
      audio.current ??= new AudioContext();
    const skip = matchMedia("(prefers-reduced-motion: reduce)").matches;
    run.current = {
      mode: next,
      at: performance.now() - (skip ? end[next] : 0),
    };
    setPhase(next);
  };

  const toggle = () => {
    const next = !muted;
    quiet.current = next;
    setMuted(next);
    localStorage.setItem(key, next ? "1" : "0");
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !scale) return;
    const rect = e.currentTarget.getBoundingClientRect();
    point.current = {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
      on: true,
    };
  };

  const busy = phase === "sort" || phase === "reset";
  const log =
    phase === "mess"
      ? [{ text: "# 10 loose files, no folders. Good luck.", tone: "dim" }]
      : phase === "reset"
        ? [{ text: "# undoing all that hard work…", tone: "dim" }]
        : [
            ...(done === 0
              ? [{ text: "# reading 10 files…", tone: "dim" }]
              : []),
            ...files.slice(0, done).map((f) => ({
              text: `doket add ${f.issue.id} ${f.name}`,
              tone: "cmd",
            })),
            ...(phase === "sorted"
              ? [{ text: "✓ 10 files filed under 3 issues", tone: "ok" }]
              : []),
          ].slice(-4);

  return (
    <div className="flex w-full max-w-[880px] flex-col items-center gap-8">
      <div
        ref={outer}
        role="img"
        aria-label="Ten loose files fly into three folders, one for each Linear issue they belong to."
        className="relative aspect-[880/540] w-full touch-pan-y select-none"
        onPointerMove={move}
        onPointerLeave={() => {
          point.current.on = false;
        }}
      >
        <div
          ref={stage}
          className="absolute top-0 left-0 origin-top-left transition-opacity duration-500"
          style={{
            width: W,
            height: H,
            transform: `scale(${scale})`,
            opacity: scale ? 1 : 0,
          }}
        >
          <div className="absolute inset-x-16 bottom-0 h-40 rounded-[50%] bg-[radial-gradient(closest-side,rgb(130_153_255/0.08),transparent)]" />

          {folders.map((f) => (
            <div
              key={f.id}
              data-back
              className="absolute top-0 left-0 h-[130px] w-[180px] origin-bottom rounded-[12px] bg-[#c9ba90]"
              style={{ zIndex: 10, opacity: 0, transform: "scale(0)" }}
            >
              <div className="absolute -top-3.5 left-3 h-5 w-[76px] rounded-t-[8px] bg-[#c9ba90]" />
            </div>
          ))}

          {folders.map((f) => (
            <div
              key={f.id}
              data-front
              className="absolute top-0 left-0 flex h-[100px] w-[186px] origin-bottom flex-col justify-end gap-0.5 rounded-[12px] p-3.5 text-manila-foreground"
              style={{
                zIndex: 20,
                opacity: 0,
                transform: "scale(0)",
                background: "linear-gradient(180deg, #f3ebd4, #e4d8b5)",
                boxShadow:
                  "inset 0 1px 0 rgb(255 255 255 / 0.7), 0 14px 28px -10px rgb(0 0 0 / 0.7)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[14px] font-semibold tracking-tight">
                  {f.id}
                </span>
                <span
                  data-count
                  className="rounded-full bg-manila-foreground/10 px-1.5 py-0.5 font-mono text-[10px]"
                >
                  0 files
                </span>
              </div>
              <span className="truncate text-[12px] opacity-70">{f.title}</span>
            </div>
          ))}

          {files.map((f, i) => (
            <div
              key={f.name}
              data-file
              className="absolute top-0 left-0 will-change-transform"
              style={{
                width: FW,
                height: FH,
                zIndex: 30 + i,
                transform: place({ x: f.x, y: f.y, r: f.r, s: 1, z: 0, l: 0 }),
                filter:
                  "drop-shadow(0 calc(2px + var(--l, 0) * 16px) calc(3px + var(--l, 0) * 12px) rgb(0 0 0 / 0.45))",
              }}
            >
              <div
                className="relative size-full rounded-md bg-[#f6f5f0] p-2.5"
                style={{
                  clipPath:
                    "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)",
                }}
              >
                <span
                  className="inline-block rounded-[4px] px-1 py-px font-mono text-[9px] font-semibold text-[#141413] uppercase"
                  style={{ background: f.tint }}
                >
                  {f.ext}
                </span>
                {f.ext === "png" ? (
                  <div
                    className="mt-2 h-11 rounded-[3px]"
                    style={{
                      background: `radial-gradient(circle at 72% 32%, #f6f5f0 0 4px, transparent 5px), linear-gradient(160deg, ${f.tint}, #8299ff)`,
                    }}
                  />
                ) : (
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    {f.bars.map((w, b) => (
                      <div
                        key={b}
                        className="h-1 rounded-full bg-[#141413]/15"
                        style={{ width: `${w}%` }}
                      />
                    ))}
                  </div>
                )}
                <p className="absolute inset-x-2.5 bottom-2 truncate font-mono text-[10px] text-[#141413]/70">
                  {f.name}
                </p>
                <div
                  className="absolute top-0 right-0 size-[18px] rounded-bl-[4px]"
                  style={{
                    background:
                      "linear-gradient(225deg, transparent 50%, #d6d2c4 50%)",
                  }}
                />
              </div>
            </div>
          ))}

          {sparks.map((s, d) => (
            <div
              key={d}
              data-dot
              className="absolute top-0 left-0 size-1.5 rounded-full"
              style={{ zIndex: 70, opacity: 0, background: s.c }}
            />
          ))}
        </div>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        <div className="flex items-center justify-center gap-2">
          <Button size="lg" className="h-10 px-4" disabled={busy} onClick={go}>
            {phase === "sorted" || phase === "reset" ? (
              <Shuffle />
            ) : (
              <WandSparkles />
            )}
            {phase === "mess" && "Let the agent file it"}
            {phase === "sort" && "Filing…"}
            {phase === "sorted" && "Make a mess"}
            {phase === "reset" && "Making a mess…"}
          </Button>
          <Button
            size="icon-lg"
            variant="ghost"
            className="size-10 text-muted-foreground"
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            onClick={toggle}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
        </div>
        <div
          aria-live="polite"
          className="flex h-[6.5rem] flex-col justify-end gap-1 overflow-hidden rounded-xl border bg-terminal px-4 py-3 font-mono text-xs"
        >
          {log.map((line) => (
            <p
              key={line.text}
              className={
                line.tone === "ok"
                  ? "animate-in text-success fade-in slide-in-from-bottom-1"
                  : line.tone === "dim"
                    ? "animate-in text-muted-foreground fade-in"
                    : "animate-in truncate fade-in slide-in-from-bottom-1"
              }
            >
              {line.tone === "cmd" && (
                <span className="text-muted-foreground">$ </span>
              )}
              {line.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
