// The marking page (step 17): the developer draws where the sign is on each photograph
// of the set; beside it, what the app would suggest - the real `suggestFrame`, in this
// browser - and how the two compare. Development only.

import { suggestFrame } from "../src/lib/anchor";
import { defaultBox, type Box, type Size } from "../src/lib/crop";
import { judge, rounded, type Frames } from "./frames";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("canvas");
const ctx = canvas.getContext("2d")!;

let names: string[] = [];
let frames: Frames = {};
let at = 0;
let image: HTMLImageElement | null = null;
let size: Size = { w: 1, h: 1 };
let guess: { frame: Box; suggested: boolean } | null = null;
let scale = 1;
let drag: { from: { x: number; y: number }; box: Box } | null = null;

async function start() {
  const res = await fetch("/__marks/list");
  if (!res.ok) {
    document.body.textContent = await res.text();
    return;
  }
  const list = await res.json() as { photos: string[]; frames: Frames };
  names = list.photos;
  frames = list.frames;
  const first = names.findIndex((n) => !(n in frames));
  show(first === -1 ? 0 : first);
}

function show(i: number) {
  at = Math.max(0, Math.min(names.length - 1, i));
  const img = new Image();
  img.onload = () => {
    image = img;
    size = { w: img.naturalWidth, h: img.naturalHeight };
    const suggestion = suggestFrame(img, size);
    guess = { frame: suggestion ?? defaultBox(size), suggested: suggestion !== null };
    // Fit the photograph into the window, whole.
    const room = { w: document.body.clientWidth - 32, h: window.innerHeight - 140 };
    scale = Math.min(room.w / size.w, room.h / size.h, 1);
    canvas.width = Math.round(size.w * scale);
    canvas.height = Math.round(size.h * scale);
    paint();
  };
  img.src = `/__marks/photo?name=${encodeURIComponent(names[at])}`;
  paint();
}

function rect(b: Box, colour: string, dashed: boolean) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.setLineDash(dashed ? [8, 6] : []);
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 3;
  ctx.strokeRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
  ctx.restore();
}

function paint() {
  const name = names[at] ?? "";
  $("name").textContent = name;
  const marked = names.filter((n) => n in frames).length;
  $("count").textContent = `${at + 1} of ${names.length} · marked ${marked}`;
  $("nosign").classList.toggle("on", frames[name] === null);

  const verdict = $("verdict");
  const truth = drag ? drag.box : frames[name];
  if (truth && guess) {
    const v = judge(truth, guess.frame);
    verdict.className = v.grade;
    verdict.textContent = `app: ${v.grade}${guess.suggested ? "" : " (centred, no suggestion)"}`
      + ` · holds ${Math.round(v.covers * 100)}% of the sign · sign fills `
      + `${Math.round(v.fills * 100)}% of the frame`;
  } else {
    verdict.className = "";
    verdict.textContent = frames[name] === null ? "no sign on this photograph" : "not marked yet";
  }

  if (!image) return;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (guess) rect(guess.frame, getComputedStyle(document.body).getPropertyValue("--guess"), true);
  if (truth) rect(truth, getComputedStyle(document.body).getPropertyValue("--truth"), false);
}

async function save() {
  const res = await fetch("/__marks/frames", { method: "PUT", body: JSON.stringify(frames) });
  if (!res.ok) alert(`Not saved: ${await res.text()}`);
}

const toImage = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  const k = size.w / r.width;
  return {
    x: Math.max(0, Math.min(size.w, (e.clientX - r.left) * k)),
    y: Math.max(0, Math.min(size.h, (e.clientY - r.top) * k)),
  };
};

canvas.addEventListener("pointerdown", (e) => {
  if (!image) return;
  canvas.setPointerCapture(e.pointerId);
  const p = toImage(e);
  drag = { from: p, box: { x: p.x, y: p.y, w: 0, h: 0 } };
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const p = toImage(e);
  drag.box = { x: Math.min(p.x, drag.from.x), y: Math.min(p.y, drag.from.y),
               w: Math.abs(p.x - drag.from.x), h: Math.abs(p.y - drag.from.y) };
  paint();
});
canvas.addEventListener("pointerup", () => {
  if (!drag) return;
  // A click without a drag is not a box.
  if (drag.box.w * scale > 6 && drag.box.h * scale > 6) {
    frames[names[at]] = rounded(drag.box);
    void save();
  }
  drag = null;
  paint();
});

$("prev").onclick = () => show(at - 1);
$("next").onclick = () => show(at + 1);
$("todo").onclick = () => {
  const next = names.findIndex((n, i) => i > at && !(n in frames));
  const any = next === -1 ? names.findIndex((n) => !(n in frames)) : next;
  if (any !== -1) show(any);
};
$("nosign").onclick = () => {
  const name = names[at];
  if (frames[name] === null) delete frames[name];
  else frames[name] = null;
  void save();
  paint();
};
$("clear").onclick = () => {
  delete frames[names[at]];
  void save();
  paint();
};
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") $("prev").click();
  else if (e.key === "ArrowRight") $("next").click();
  else if (e.key === "u" || e.key === "U") $("todo").click();
  else if (e.key === "n" || e.key === "N") $("nosign").click();
  else if (e.key === "Delete" || e.key === "Backspace") $("clear").click();
});
window.addEventListener("resize", () => show(at));

void start();
