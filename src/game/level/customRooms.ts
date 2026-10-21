import { parseEgg, serializeEgg, type EggRoom } from './roomFormat';

const STORAGE_KEY = 'cluckles.customRooms.v1';

/**
 * Rooms saved from the editor live in localStorage so they show up in the room
 * rotation immediately, even though the browser cannot write to disk. The
 * editor also offers a download so a .egg can be committed to the repo.
 */
export function loadCustomRooms(): EggRoom[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded)) {
      return [];
    }
    const rooms: EggRoom[] = [];
    for (const entry of decoded) {
      try {
        rooms.push(parseEgg(entry));
      } catch {
        // Skip anything corrupt rather than losing the whole library.
      }
    }
    return rooms;
  } catch {
    return [];
  }
}

function persist(rooms: EggRoom[]): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
}

export function saveCustomRoom(room: EggRoom): EggRoom[] {
  const rooms = loadCustomRooms();
  const index = rooms.findIndex((r) => r.id === room.id);
  if (index >= 0) {
    rooms[index] = room;
  } else {
    rooms.push(room);
  }
  persist(rooms);
  return rooms;
}

export function deleteCustomRoom(id: string): EggRoom[] {
  const rooms = loadCustomRooms().filter((room) => room.id !== id);
  persist(rooms);
  return rooms;
}

export function exportEgg(room: EggRoom): string {
  return serializeEgg(room);
}

export function downloadEgg(room: EggRoom): void {
  if (typeof document === 'undefined') {
    return;
  }
  const blob = new Blob([serializeEgg(room)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${room.id}.egg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
