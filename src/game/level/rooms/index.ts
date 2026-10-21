import { parseEgg, type EggRoom, type RoomRole } from '../roomFormat';

import bossPit from './boss-pit.egg?raw';
import bossYard from './boss-yard.egg?raw';
import cornerNooks from './corner-nooks.egg?raw';
import crossRoads from './cross-roads.egg?raw';
import diamond from './diamond.egg?raw';
import exitNest from './exit-nest.egg?raw';
import exitStairs from './exit-stairs.egg?raw';
import feedMarket from './feed-market.egg?raw';
import feedStore from './feed-store.egg?raw';
import lattice from './lattice.egg?raw';
import pillarHall from './pillar-hall.egg?raw';
import pond from './pond.egg?raw';
import ringAround from './ring-around.egg?raw';
import serpentine from './serpentine.egg?raw';
import splitCorridor from './split-corridor.egg?raw';
import startClearing from './start-clearing.egg?raw';
import startNest from './start-nest.egg?raw';
import stoneTeeth from './stone-teeth.egg?raw';
import treasureAlcove from './treasure-alcove.egg?raw';
import treasureVault from './treasure-vault.egg?raw';

/**
 * Built-in rooms are real .egg files, imported as text and parsed at load time
 * exactly the way a file dropped into the editor is. Keeping them as data (not
 * code) means the game and the editor always agree on the format.
 */
export const BUILTIN_EGG_SOURCES: readonly string[] = [
  startNest,
  startClearing,
  pillarHall,
  crossRoads,
  cornerNooks,
  serpentine,
  stoneTeeth,
  ringAround,
  diamond,
  lattice,
  splitCorridor,
  pond,
  treasureVault,
  treasureAlcove,
  feedStore,
  feedMarket,
  bossPit,
  bossYard,
  exitNest,
  exitStairs,
];

export function loadBuiltinRooms(): EggRoom[] {
  return BUILTIN_EGG_SOURCES.map((source, index) =>
    parseEgg(source, `builtin-${index}`),
  );
}

export function builtinRoomsByRole(rooms: readonly EggRoom[], role: RoomRole): EggRoom[] {
  return rooms.filter((room) => room.role === role);
}
