We tried to make a top down rougelike like the Binding of Issac, but with chickens. These chickens had different projectiles and could be swapped around to change play style.

We had the chicken stacking system, stack GUI and swapping it, perks, clearing rooms, feed, shops, enemies, but did not get to having multiple floors. 

The agent did not have much trouble understanding, it got pretty much all basic features in one shot only making water walkable which was a quick fix. It also obviously messed up on the GUI, as that is not visible to it as it is not using computer vision in any way.

Yes.  The first prompt was very large, causing it to take a good while to finish (~40 mins). However, the game came out in a nice state that was decently playable. Overall, It may not have been efficient, but it worked.

The agent did not do anything too complex, most of it was able to be explained as it was basic typescript and JSON files which can be interpreted semi-easily. 


# Cluckles

A top-down roguelike shooter where your weapon is a stack of chickens. Each
chicken sits in one of four ring slots (`up → right → down → left`, clockwise),
and pressing Space fires every equipped chicken in its slot's direction. Empty
slots do not fire.

Built on the same dev stack as `NatTuck/drunk-panda`: **Excalibur.js 0.32**,
TypeScript, Vite and pnpm. Client only, no backend.

## Run it

```bash
pnpm install
pnpm dev          # then open the printed URL
```

```bash
pnpm test         # headless tests for the core mechanics
pnpm typecheck
pnpm build        # static build in dist/ (index.html + editor.html)
```

> Requires Node >= 20.19.

### Single-file build

```bash
pnpm build:single  # writes Cluckles.html to the project root
```

`Cluckles.html` is a self-contained copy of the game. Open it directly in a
browser, or share the file. It is git-ignored, so rebuild it after changes.

## Controls

| Action | Keys |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Fire every equipped chicken | `Space` |
| Rotate chicken stack clockwise / anticlockwise | `E` / `Q` |
| Chicken stack GUI | `Tab` |
| Perks GUI | `P` |
| Interact / buy | `F` |
| New run | `R` |
| Debug overlay | `F1` |

You start with 3 hearts and three Henny chickens (up, right, down). Clear rooms
to
find more chickens, chicken feed, and perks.

## The gimmick

- **15 chickens**, each a different weapon: a 3-way `Triple Chick`, an
  exploding `Boom Cluck`, a piercing `Rail Rooster`, a ricocheting `Bouncer`,
  a homing `Homer`, `Frost` (slows), `Spark` (chains), `Toxic` (poison),
  `Ghost` (phases walls), `Boomer` (returns), `Flame` (short stream), and more.
- **Stack GUI** (`E`): click a chicken, then click a ring slot to assign it.
  Cooldown rings are drawn around each chicken in the world.
- **Perks GUI** (`P`): passive run upgrades (damage, fire rate, extra
  projectile, thorns, heal-on-clear, shop discount, ...).

## Rooms: the `.egg` format

Rooms are JSON files with the `.egg` extension (`src/game/level/rooms/*.egg`).
A room is a grid of single characters plus a little metadata:

```
#  wall      .  floor     ~  water (impassable)     o  rock      =  fence
p  spawn     +  door
C F D R B S X W M O   enemies (cat, fox, dog, rat, bat, snake, spider, crow, slime, rooster)
c f k s h              pedestals (chicken, feed, perk, shop, heart)
```

Doors sit in the middle of a side and every room in a floor gets **1–4** of
them, wired from the floor graph. **30 designed rooms** ship in the repo and are
imported as real `.egg` text, so the editor and the game always agree.

Floors are generated from that pool: a start room, combat rooms, a treasure
room, a shop with **three** items you buy with feed, a boss room, and an exit
room whose trapdoor is sealed until you beat the boss.

### Boss arenas

Each of the ten floor bosses fights in its **own large arena**, tagged with that
boss in the `.egg` (`"tags": ["boss", "wolf"]`), so the layout always matches the
fight — an open sky for the hawk, a water lagoon for the croc, corner dens for
the wolf, and so on. The room picker (`pickBossTemplate`) matches the arena's
tags against `bossForFloor(depth)`, falling back to a generic boss room for
custom pools.

Every boss also has a **telegraphed secondary attack** unique to it, alongside
its normal volley and movement style: a spreading egg fan, a bone ring, a
triple-kick charge, a minion howl, a ground slam, a lightning barrage, a tail
sweep, a pounce, a homing blood volley, or a spinning death roll. See
`bossSpecial()` in `src/game/enemies/enemies.ts`.

## Room editor (subpage)

Open **`/editor.html`** (also linked from the game-over screen). It is a tile
editor over the exact alphabet above:

- paint with the left mouse button, right-click to erase to floor
- toggle the four middle-side doors
- set the room name, id and role
- **Save .egg** stores it in `localStorage`, which the game reads on the next
  floor, so your room immediately joins the rotation
- **Download** writes a real `.egg` file you can commit to `src/game/level/rooms/`

## Architecture

```
src/
  main.ts                     game entry (Excalibur engine + scene)
  editor/main.ts              the .egg room editor subpage
  game/
    config.ts                 every tunable number
    dir.ts                    cardinal directions (slot order)
    level/roomFormat.ts        .egg parse/serialize/validate + char helpers
    level/tiles.ts            the room character alphabet
    level/rooms/*.egg         20 built-in rooms (data, imported ?raw)
    level/dungeon.ts          floor graph, doors, rewards, shop stock
    level/customRooms.ts      rooms saved from the editor (localStorage)
    chickens/                 the 15-chicken roster + projectile specs
    perks/perks.ts            the 14 perks + StatMods aggregation
    enemies/enemies.ts        Zelda-1 style AI (bounce / chase / hop / lunge / shoot)
    projectiles/              projectile lifecycle (pierce, bounce, homing, ...)
    entities/player.ts        pure movement step
    physics/                  tile collision
    render/                   procedural canvas art (terrain, actors, particles)
    systems/                  run state (hearts, feed, stack, perks)
    ui/hud.ts                 DOM HUD + stack/perks overlays
    scenes/GameScene.ts       rooms, doors, combat, rewards
tests/                        headless tests for the core mechanics
```

## Tests

`pnpm test` covers the `.egg` format round-trip and validation, the built-in
room pool, floor generation (connectivity + symmetric 1–4 doors), the chicken
stack slot mapping, projectile behaviour (spread, lifetime, wall bounce), enemy
AI (chasing, ranged telegraph/fire, staying in bounds), perk modifiers and
player movement (acceleration, wall sliding, impassable water).
