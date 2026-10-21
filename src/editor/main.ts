/**
 * The .egg room editor subpage.
 *
 * A tile editor over the exact same character alphabet the game uses. Save puts
 * the room in localStorage, which `loadCustomRooms()` reads on the next floor,
 * so a freshly painted room joins the rotation immediately. Download writes a
 * real `.egg` file.
 */
import {
  charAt,
  cloneRoom,
  doorGapTiles,
  makeBlankRoom,
  parseEgg,
  setChar,
  type DoorSide,
  type EggRoom,
  type RoomRole,
} from '../game/level/roomFormat';
import { DOOR_CHAR, ENEMY_CHARS, PEDESTAL_CHARS, SPAWN_CHAR, TERRAIN } from '../game/level/tiles';
import { loadBuiltinRooms } from '../game/level/rooms';
import { downloadEgg, loadCustomRooms, saveCustomRoom } from '../game/level/customRooms';

const CELL = 26;
const DEFAULT_COLS = 19;
const DEFAULT_ROWS = 11;

const COLORS: Record<string, string> = {
  [TERRAIN.wall]: '#3b3444',
  [TERRAIN.floor]: '#4b4339',
  [TERRAIN.water]: '#2b5570',
  [TERRAIN.rock]: '#57544f',
  [TERRAIN.fence]: '#6b4a28',
  [DOOR_CHAR]: '#f0c860',
};

const ENTITY_GLYPH: Record<string, string> = {
  [SPAWN_CHAR]: '☺',
  [PEDESTAL_CHARS.chicken]: 'C',
  [PEDESTAL_CHARS.feed]: 'F',
  [PEDESTAL_CHARS.perk]: 'K',
  [PEDESTAL_CHARS.shop]: '$',
  [PEDESTAL_CHARS.heart]: '♥',
};

interface PaletteEntry {
  char: string;
  label: string;
  color: string;
}

const PALETTE: PaletteEntry[] = [
  { char: TERRAIN.wall, label: 'wall', color: COLORS[TERRAIN.wall] as string },
  { char: TERRAIN.floor, label: 'floor', color: COLORS[TERRAIN.floor] as string },
  { char: TERRAIN.water, label: 'water', color: COLORS[TERRAIN.water] as string },
  { char: TERRAIN.rock, label: 'rock', color: COLORS[TERRAIN.rock] as string },
  { char: TERRAIN.fence, label: 'fence', color: COLORS[TERRAIN.fence] as string },
  { char: SPAWN_CHAR, label: 'spawn', color: '#8fe3b0' },
  { char: PEDESTAL_CHARS.chicken, label: 'chicken', color: '#f2d06b' },
  { char: PEDESTAL_CHARS.feed, label: 'feed', color: '#e0a24b' },
  { char: PEDESTAL_CHARS.perk, label: 'perk', color: '#c489f2' },
  { char: PEDESTAL_CHARS.shop, label: 'shop', color: '#7fd0e3' },
  { char: PEDESTAL_CHARS.heart, label: 'heart', color: '#e0614f' },
  ...Object.entries(ENEMY_CHARS).map(([ch, type]) => ({ char: ch, label: type, color: '#e07a6a' })),
];

const SIDES: DoorSide[] = ['up', 'right', 'down', 'left'];

function must<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Editor is missing #${id}`);
  return found as T;
}

const canvas = must<HTMLCanvasElement>('board');
const paletteEl = must<HTMLDivElement>('palette');
const doorsEl = must<HTMLDivElement>('doors');
const nameEl = must<HTMLInputElement>('name');
const idEl = must<HTMLInputElement>('rid');
const roleEl = must<HTMLSelectElement>('role');
const loadEl = must<HTMLSelectElement>('load');
const fileEl = must<HTMLInputElement>('file');
const statusEl = must<HTMLDivElement>('status');

let room: EggRoom = makeBlankRoom(DEFAULT_COLS, DEFAULT_ROWS, 'New Room', 'combat');
room.id = `custom-${Date.now().toString(36)}`;
let brush = TERRAIN.wall as string;
let paintChar = TERRAIN.floor as string;
let painting = false;
let hover: { x: number; y: number } | null = null;
let loadRooms: EggRoom[] = [];

function freshId(): string {
  return `custom-${Date.now().toString(36)}`;
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function colorFor(ch: string): string {
  return COLORS[ch] ?? (ch === SPAWN_CHAR ? '#2c3a2c' : '#3a3340');
}

function glyphFor(ch: string): string {
  if (ENTITY_GLYPH[ch]) return ENTITY_GLYPH[ch] as string;
  if (ENEMY_CHARS[ch]) return ch;
  return '';
}

function drawDoorMark(ctx: CanvasRenderingContext2D, side: DoorSide): void {
  const midX = Math.floor(room.width / 2) * CELL;
  const midY = Math.floor(room.height / 2) * CELL;
  ctx.fillStyle = 'rgba(240,200,96,0.45)';
  if (side === 'up') ctx.fillRect(midX - CELL, 0, CELL * 3, 6);
  if (side === 'down') ctx.fillRect(midX - CELL, room.height * CELL - 6, CELL * 3, 6);
  if (side === 'left') ctx.fillRect(0, midY - CELL, 6, CELL * 3);
  if (side === 'right') ctx.fillRect(room.width * CELL - 6, midY - CELL, 6, CELL * 3);
}

function draw(): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = room.width * CELL;
  const H = room.height * CELL;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const ch = charAt(room, x, y);
      ctx.fillStyle = colorFor(ch);
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      const glyph = glyphFor(ch);
      if (glyph) {
        ctx.fillStyle = '#f4efe6';
        ctx.font = `${Math.floor(CELL * 0.6)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, x * CELL + CELL / 2, y * CELL + CELL / 2 + 1);
      }
    }
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= room.width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, H);
    ctx.stroke();
  }
  for (let y = 0; y <= room.height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(W, y * CELL);
    ctx.stroke();
  }

  for (const side of room.doors ?? []) drawDoorMark(ctx, side);

  if (hover) {
    ctx.strokeStyle = '#ffcf5c';
    ctx.lineWidth = 2;
    ctx.strokeRect(hover.x * CELL + 1, hover.y * CELL + 1, CELL - 2, CELL - 2);
  }
}

function tileFrom(e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor(((e.clientX - rect.left) / rect.width) * room.width),
    y: Math.floor(((e.clientY - rect.top) / rect.height) * room.height),
  };
}

function paintAt(p: { x: number; y: number }, ch: string): void {
  if (p.x < 0 || p.y < 0 || p.x >= room.width || p.y >= room.height) return;
  setChar(room, p.x, p.y, ch);
  draw();
}

function buildPalette(): void {
  paletteEl.innerHTML = '';
  for (const entry of PALETTE) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = entry.char === brush ? 'sel' : '';
    button.innerHTML = `<span class="sw" style="background:${entry.color}"></span><span>${entry.label}</span>`;
    button.addEventListener('click', () => {
      brush = entry.char;
      buildPalette();
    });
    paletteEl.appendChild(button);
  }
}

function buildDoors(): void {
  doorsEl.innerHTML = '';
  for (const side of SIDES) {
    const on = (room.doors ?? []).includes(side);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = on ? 'on' : '';
    button.textContent = on ? `${side} ✓` : side;
    button.addEventListener('click', () => toggleDoor(side));
    doorsEl.appendChild(button);
  }
}

function toggleDoor(side: DoorSide): void {
  const set = new Set<DoorSide>(room.doors ?? []);
  const turnOn = !set.has(side);
  if (turnOn) set.add(side);
  else set.delete(side);
  room.doors = [...set];
  for (const cell of doorGapTiles(room, side)) {
    setChar(room, cell.x, cell.y, turnOn ? DOOR_CHAR : TERRAIN.wall);
  }
  buildDoors();
  draw();
}

function syncInputs(): void {
  nameEl.value = room.name;
  idEl.value = room.id;
  roleEl.value = room.role;
}

function refreshLoadList(): void {
  loadRooms = [...loadBuiltinRooms(), ...loadCustomRooms()];
  loadEl.innerHTML = '<option value="">— pick a room —</option>';
  loadRooms.forEach((entry, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${entry.name} · ${entry.role} · ${entry.id}`;
    loadEl.appendChild(option);
  });
}

function adoptRoom(next: EggRoom): void {
  room = next;
  syncInputs();
  buildDoors();
  draw();
}

// ------------------------------------------------------------------ events

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  painting = true;
  paintChar = e.button === 2 ? (TERRAIN.floor as string) : brush;
  paintAt(tileFrom(e), paintChar);
});
canvas.addEventListener('mousemove', (e) => {
  hover = tileFrom(e);
  if (painting) paintAt(hover, paintChar);
  else draw();
});
canvas.addEventListener('mouseleave', () => {
  hover = null;
  draw();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mouseup', () => {
  painting = false;
});

must<HTMLButtonElement>('save').addEventListener('click', () => {
  room.name = nameEl.value.trim() || 'Custom Room';
  room.id = (idEl.value.trim() || freshId()).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  room.role = roleEl.value as RoomRole;
  saveCustomRoom(room);
  idEl.value = room.id;
  refreshLoadList();
  setStatus(`Saved ${room.id}.egg to this browser. It joins the room rotation on the next floor.`);
});

must<HTMLButtonElement>('download').addEventListener('click', () => {
  room.name = nameEl.value.trim() || 'Custom Room';
  room.id = (idEl.value.trim() || freshId()).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  room.role = roleEl.value as RoomRole;
  downloadEgg(room);
  setStatus(`Downloaded ${room.id}.egg`);
});

must<HTMLButtonElement>('new').addEventListener('click', () => {
  const next = makeBlankRoom(DEFAULT_COLS, DEFAULT_ROWS, 'New Room', 'combat');
  next.id = freshId();
  adoptRoom(next);
  setStatus('New blank room.');
});

loadEl.addEventListener('change', () => {
  if (loadEl.value === '') return;
  const source = loadRooms[Number(loadEl.value)];
  if (!source) return;
  const copy = cloneRoom(source);
  copy.id = freshId();
  adoptRoom(copy);
  setStatus(`Loaded "${source.name}" as a new custom room.`);
});

fileEl.addEventListener('change', () => {
  const file = fileEl.files?.[0];
  if (!file) return;
  void file.text().then((text) => {
    try {
      adoptRoom(parseEgg(text));
      setStatus(`Loaded ${file.name}`);
    } catch (error) {
      setStatus(`Could not load: ${(error as Error).message}`);
    }
  });
});

// -------------------------------------------------------------------- boot

buildPalette();
buildDoors();
syncInputs();
refreshLoadList();
draw();
setStatus('Pick a tile, then paint. Save to make it show up in the room rotation.');
