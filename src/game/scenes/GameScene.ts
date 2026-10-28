import { Actor, Canvas, Scene, vec, type Engine } from 'excalibur';
import * as CONFIG from '../config';
import { ENEMY, TILE, VIEW } from '../config';
import { CHICKEN_BY_ID, rollChicken } from '../chickens/chickens';
import { resolveProjectile } from '../chickens/types';
import { DIRS, OPPOSITE, dirAngle } from '../dir';
import {
  makeEnemy,
  updateEnemy,
  type Enemy,
  type EnemyContext,
} from '../enemies/enemies';
import { makePlayer, stepPlayer, type Player } from '../entities/player';
import {
  combatReward,
  ensureSpawns,
  generateDungeon,
  neighborKey,
  type Dungeon,
  type DungeonNode,
  type RewardPlan,
} from '../level/dungeon';
import { loadCustomRooms } from '../level/customRooms';
import { loadBuiltinRooms } from '../level/rooms';
import {
  doorCenterTile,
  doorEntryTile,
  findReachableNear,
  findWalkableNear,
  roomPedestals,
  roomSpawn,
  type DoorSide,
  type EggRoom,
} from '../level/roomFormat';
import type { PedestalKind } from '../level/tiles';
import { rollPerk } from '../perks/perks';
import {
  spawnEnemyShot,
  spawnFromFire,
  stepProjectile,
  type Projectile,
} from '../projectiles/projectiles';
import {
  drawDoorMat,
  drawEnemy,
  drawPedestal,
  drawPlayer,
  drawProjectile,
  drawTrapdoor,
} from '../render/art';
import { Particles } from '../render/particles';
import { buildTerrain, roomPixelHeight, roomPixelWidth } from '../render/terrain';
import { RunState } from '../systems/run';
import { Hud, type StackSelection } from '../ui/hud';
import { InputMap } from '../input/InputMap';
import { Sfx } from '../audio/sfx';
import { circlesOverlap } from '../util/aabb';
import { clamp, mulberry32, seedFromText, type Rng } from '../util/math';

export type GameMode = 'menu' | 'play' | 'stack' | 'perks' | 'map' | 'dead' | 'victory';

/** Rooms the player has entered this floor, used for the map. */

interface RoomPedestal {
  kind: PedestalKind;
  x: number;
  y: number;
  chickenId?: string;
  perkId?: string;
  amount?: number;
  price?: number;
  label?: string;
  shopIndex?: number;
  sold: boolean;
  taken: boolean;
  plan?: RewardPlan;
}

export class GameScene extends Scene {
  private run!: RunState;
  private dungeon!: Dungeon;
  private node!: DungeonNode;
  private room!: EggRoom;
  private player!: Player;

  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private pedestals: RoomPedestal[] = [];
  private particles = new Particles();

  private terrain: HTMLCanvasElement | null = null;
  private worldActor!: Actor;
  private worldGraphic!: Canvas;

  private inputMap!: InputMap;
  private hud!: Hud;
  private readonly sfx = new Sfx();

  private mode: GameMode = 'play';
  private time = 0;
  private hitstop = 0;
  private debug = false;
  private debugTimer = 0;
  private hudTimer = 0;
  private doorCooldown = 0;
  private stackSelection: StackSelection = null;
  private slotRecoil = [0, 0, 0, 0];
  private enemyIdCounter = 0;
  private rng: Rng = mulberry32(1);
  private roomPool: EggRoom[] = [];
  private trapdoorOpen = false;

  override onInitialize(engine: Engine): void {
    this.engine = engine;

    this.roomPool = [...loadBuiltinRooms(), ...loadCustomRooms()];
    this.run = new RunState();
    this.player = makePlayer(0, 0);

    this.particles = new Particles();
    this.hud = new Hud(() => this.restart());
    this.inputMap = new InputMap(engine, {
      onToggleStack: () => this.toggleOverlay('stack'),
      onRotateStack: (clockwise) => this.rotateStack(clockwise),
      onTogglePerks: () => this.toggleOverlay('perks'),
      onToggleMap: () => this.toggleOverlay('map'),
      onRestart: () => this.restart(),
      onToggleDebug: () => this.toggleDebug(),
    });

    this.worldGraphic = new Canvas({
      width: VIEW.width,
      height: VIEW.height,
      cache: false,
      draw: (ctx) => this.drawWorld(ctx),
    });
    this.worldActor = new Actor({ x: 0, y: 0, anchor: vec(0, 0), z: 0 });
    this.worldActor.graphics.use(this.worldGraphic);
    this.add(this.worldActor);

    // Build a valid world behind the menu so drawing never sees an empty room.
    this.dungeon = this.buildDungeon();
    this.enterNode(this.dungeon.nodes.get(this.dungeon.startKey)!, null, true);
    this.showMenu();

    const unlock = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    window.__cluck = { scene: this, run: this.run, config: CONFIG };
    void engine;
  }

  private buildDungeon(): Dungeon {
    return generateDungeon({
      seed: this.run.seed,
      depth: this.run.depth,
      pool: this.roomPool,
      ownedChickens: this.run.owned,
      ownedPerks: this.run.perks,
    });
  }

  // ---------------------------------------------------------------- lifecycle

  override onPreUpdate(_engine: Engine, elapsed: number): void {
    const dt = Math.min(elapsed / 1000, 1 / 30);
    if (dt <= 0) return;

    for (let i = 0; i < this.slotRecoil.length; i++) {
      this.slotRecoil[i] = Math.max(0, (this.slotRecoil[i] ?? 0) - dt * 6);
    }
    this.particles.update(dt);

    if (this.mode === 'menu' || this.mode === 'dead' || this.mode === 'victory') {
      this.time += dt;
      return;
    }

    if (this.mode === 'stack' || this.mode === 'perks') {
      this.time += dt;
      return;
    }

    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      return;
    }

    this.time += dt;
    this.doorCooldown = Math.max(0, this.doorCooldown - dt);

    const input = this.inputMap.sample();
    stepPlayer(this.player, input, this.room, dt, this.run.mods.moveSpeedMul);
    this.tryShoot(input);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.handlePedestals(input);
    this.handleTrapdoor();
    this.handleDoors();

    this.updateHud(dt);
  }

  // ------------------------------------------------------------------ rooms

  private enterNode(node: DungeonNode, enterSide: DoorSide | null, first = false): void {
    const firstVisit = !node.visited;
    this.node = node;
    this.room = node.room;
    this.terrain = buildTerrain(node.room);
    node.visited = true;

    const w = roomPixelWidth(node.room);
    const h = roomPixelHeight(node.room);
    this.worldGraphic = new Canvas({
      width: w,
      height: h,
      cache: false,
      draw: (ctx) => this.drawWorld(ctx),
    });
    this.worldActor.graphics.use(this.worldGraphic);

    const zoom = Math.min(VIEW.width / w, VIEW.height / h, 1);
    this.camera.zoom = zoom;
    this.camera.pos = vec(w / 2, h / 2);

    // Player placement. Door entry snaps to the nearest walkable tile so you
    // can never be dropped inside rock, wall or water.
    const spawn = roomSpawn(node.room);
    const tile = enterSide
      ? doorEntryTile(node.room, enterSide)
      : findWalkableNear(node.room, spawn.x, spawn.y);
    this.player.x = (tile.x + 0.5) * TILE;
    this.player.y = (tile.y + 0.5) * TILE;
    this.player.vx = 0;
    this.player.vy = 0;
    // Match the enemies' entry grace window, so the player is safe for exactly
    // as long as the room is inert.
    this.player.invuln = ENEMY.entryInertTime;
    this.player.slotCooldown = [0, 0, 0, 0];

    this.projectiles = [];
    this.pedestals = [];
    this.enemies = [];
    this.doorCooldown = 0.5;
    this.spawnRoomContents(firstVisit);

    this.trapdoorOpen = this.isBossCleared();
    this.hud.showShopPrompt(null);
    this.hud.closeOverlay();
    this.hud.update(this.run, node.room.name);
    if (!first) {
      this.sfx.door();
    }
  }

  private spawnRoomContents(firstVisit: boolean): void {
    const node = this.node;

    // Authored pedestals come first so level designers control placement.
    // They only appear on the first visit to avoid re-collecting them.
    if (firstVisit) {
      for (const authored of roomPedestals(node.room)) {
        const tile = this.findOpenTile(node.room, authored.x, authored.y);
        this.addPedestal(authored.kind, tile.x, tile.y, this.rollAuthoredReward(authored.kind));
      }
    }

    // Enemies (authored, or rolled once per floor).
    if (!node.cleared) {
      const spawns = ensureSpawns(node, this.run.depth, this.rng);
      for (const spawn of spawns) {
        const enemy = makeEnemy(spawn.type, spawn.x, spawn.y, this.run.depth, this.enemyIdCounter++);
        // Freeze the AI while the room "loads" so the player can react.
        enemy.inertTime = ENEMY.entryInertTime;
        this.enemies.push(enemy);
      }
    }

    if (node.role === 'shop' && node.shop) {
      const midY = Math.floor(node.room.height / 2);
      const x0 = Math.floor(node.room.width / 2) - 4;
      node.shop.forEach((entry, i) => {
        const tile = this.findOpenTile(node.room, x0 + i * 4, midY);
        const pedestal = this.addPedestal('shop', tile.x, tile.y, entry.plan);
        pedestal.price = entry.price;
        pedestal.sold = entry.sold;
        pedestal.label = this.describeReward(entry.plan);
        pedestal.shopIndex = i;
      });
    }

    // Post-clear (or treasure) reward pedestal, kept until it is taken.
    if (node.reward && node.rewardPending) {
      const tile = this.findOpenTile(node.room, Math.floor(node.room.width / 2), Math.floor(node.room.height / 2));
      this.addPedestal(this.pedestalKindFor(node.reward), tile.x, tile.y, node.reward);
    }
  }

  private rollAuthoredReward(kind: PedestalKind): RewardPlan {
    if (kind === 'chicken') return { kind: 'chicken', chickenId: rollChicken(this.run.owned, this.rng).id };
    if (kind === 'perk') {
      const perk = rollPerk(this.run.perks, this.rng);
      return perk ? { kind: 'perk', perkId: perk.id } : { kind: 'feed', amount: 20 };
    }
    if (kind === 'feed') return { kind: 'feed', amount: 20 };
    return { kind: 'feed', amount: 20 };
  }

  private pedestalKindFor(plan: RewardPlan): PedestalKind {
    if (plan.kind === 'chicken') return 'chicken';
    if (plan.kind === 'perk') return 'perk';
    if (plan.kind === 'feed') return 'feed';
    return 'feed';
  }

  private describeReward(plan: RewardPlan): string {
    if (plan.kind === 'chicken') return CHICKEN_BY_ID[plan.chickenId ?? '']?.name ?? 'Chicken';
    if (plan.kind === 'perk') return 'Perk';
    if (plan.kind === 'feed') return `${plan.amount ?? 20} feed`;
    return 'Heart';
  }

  private addPedestal(
    kind: PedestalKind,
    tileX: number,
    tileY: number,
    plan: RewardPlan,
  ): RoomPedestal {
    const pedestal: RoomPedestal = {
      kind,
      x: (tileX + 0.5) * TILE,
      y: (tileY + 0.5) * TILE,
      chickenId: plan.chickenId,
      perkId: plan.perkId,
      amount: plan.amount,
      sold: false,
      taken: false,
      plan,
    };
    this.pedestals.push(pedestal);
    return pedestal;
  }

  private findOpenTile(room: EggRoom, tx: number, ty: number): { x: number; y: number } {
    return findReachableNear(room, tx, ty);
  }

  // ----------------------------------------------------------------- combat

  private tryShoot(input: ReturnType<InputMap['sample']>): void {
    for (let slot = 0; slot < DIRS.length; slot++) {
      const dir = DIRS[slot]!;
      if (!input.shoot[dir]) continue;
      if ((this.player.slotCooldown[slot] ?? 0) > 0) continue;

      const id = this.run.stack.slots[slot];
      if (!id) continue;
      const def = CHICKEN_BY_ID[id];
      if (!def) continue;

      const fire = resolveProjectile(def, this.run.mods);
      const angle = dirAngle(dir);
      const ox = this.player.x + Math.cos(angle) * (this.player.r + 8);
      const oy = this.player.y + Math.sin(angle) * (this.player.r + 8);
      this.projectiles.push(...spawnFromFire(fire, ox, oy, angle));
      this.player.slotCooldown[slot] = fire.cooldown;
      this.slotRecoil[slot] = 1;
      this.sfx.shoot();
      this.particles.burst(ox, oy, fire.color, 3, 70);
    }
  }

  private updateEnemies(dt: number): void {
    const ctx: EnemyContext = {
      playerX: this.player.x,
      playerY: this.player.y,
      playerAlive: !this.run.isDead,
      room: this.room,
      rng: this.rng,
    };

    for (const enemy of this.enemies) {
      const shots = updateEnemy(enemy, ctx, dt);

      for (const shot of shots) {
        this.projectiles.push(
          spawnEnemyShot(shot.x, shot.y, shot.vx, shot.vy, shot.damage, shot.radius, shot.color),
        );
      }

      if (enemy.hp <= 0 && !enemy.dead) {
        this.killEnemy(enemy);
      }

      if (!enemy.dead && !this.run.isDead) {
        if (circlesOverlap({ x: this.player.x, y: this.player.y, r: this.player.r }, { x: enemy.x, y: enemy.y, r: enemy.r })) {
          this.damagePlayer(enemy.def.damage, enemy.x, enemy.y);
          if (this.run.mods.thorns > 0) {
            this.damageEnemy(enemy, this.run.mods.thorns, 0, 0, false);
          }
          const push = 1 / (Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) || 1);
          this.player.vx += (this.player.x - enemy.x) * push * 260;
          this.player.vy += (this.player.y - enemy.y) * push * 260;
        }
      }
    }

    const survivors = this.enemies.filter((enemy) => !(enemy.dead && enemy.deathTime > ENEMY.deathTime));
    this.enemies = survivors;

    if (!this.node.cleared && this.enemies.length === 0 && this.roomsHasEnemies()) {
      this.onRoomCleared();
    }
  }

  private roomsHasEnemies(): boolean {
    const spawns = this.node.spawns;
    return !!spawns && spawns.length > 0;
  }

  private killEnemy(enemy: Enemy): void {
    enemy.dead = true;
    enemy.deathTime = 0;
    enemy.hp = 0;
    this.run.addFeed(enemy.feed);
    this.particles.text(enemy.x, enemy.y - enemy.r - 6, `+${Math.round(enemy.feed * this.run.mods.feedMul)}`, '#f6d76c');
    this.particles.burst(enemy.x, enemy.y, enemy.def.color, 16, 240);
    this.sfx.hit();
    if (enemy.def.boss) {
      this.sfx.explode();
      this.camera.shake(10, 8, 360);
      this.hitstop = Math.max(this.hitstop, 0.12);
      this.hud.toast('THE FAT ROOSTER FALLS');
    } else {
      this.camera.shake(3, 2, 120);
    }
  }

  private damageEnemy(enemy: Enemy, amount: number, dirX: number, dirY: number, crit: boolean): void {
    if (enemy.dead) return;
    enemy.hp -= amount;
    enemy.hitFlash = 0.12;
    enemy.hurtTime = ENEMY.hurtTime;
    enemy.knockX += dirX * ENEMY.knockback;
    enemy.knockY += dirY * ENEMY.knockback;
    this.particles.text(
      enemy.x,
      enemy.y - enemy.r - 4,
      `${Math.round(amount)}`,
      crit ? '#ffd54a' : '#fff2cf',
      crit ? 1.3 : 1,
    );
    this.particles.burst(enemy.x, enemy.y, crit ? '#ffd54a' : '#ffe8b0', 5, 130);
    if (enemy.hp <= 0 && !enemy.dead) {
      this.killEnemy(enemy);
    }
  }

  private updateProjectiles(dt: number): void {
    const playerCircle = { x: this.player.x, y: this.player.y, r: this.player.r };

    for (const p of this.projectiles) {
      if (p.dead) continue;

      const target = p.homing > 0 ? this.nearestEnemy(p.x, p.y) : null;
      stepProjectile(p, dt, {
        room: this.room,
        homingTarget: target ? { x: target.x, y: target.y } : null,
        playerX: this.player.x,
        playerY: this.player.y,
      });

      if (p.owner === 'player') {
        for (const enemy of this.enemies) {
          if (enemy.dead || p.dead) continue;
          if (p.hitIds.includes(enemy.id)) continue;
          if (!circlesOverlap({ x: p.x, y: p.y, r: p.r }, { x: enemy.x, y: enemy.y, r: enemy.r })) {
            continue;
          }
          p.hitIds.push(enemy.id);
          const len = Math.hypot(p.vx, p.vy) || 1;
          this.damageEnemy(enemy, p.damage, (p.vx / len) * (p.knockback / 190), (p.vy / len) * (p.knockback / 190), p.crit);
          if (p.slowFactor > 0) {
            enemy.slowFactor = p.slowFactor;
            enemy.slowTime = p.slowTime;
          }
          if (p.poisonDps > 0) {
            enemy.poisonDps = p.poisonDps;
            enemy.poisonTime = p.poisonTime;
          }
          if (p.chain > 0) {
            this.chainLightning(p, enemy);
          }
          if (p.explode > 0) {
            this.explodeAt(p.x, p.y, p.explode, p.explodeDamage);
            p.explode = 0;
          }
          if (p.pierce > 0) {
            p.pierce -= 1;
          } else {
            p.dead = true;
          }
        }
      } else if (!this.run.isDead) {
        if (circlesOverlap({ x: p.x, y: p.y, r: p.r }, playerCircle)) {
          p.dead = true;
          this.damagePlayer(p.damage, p.x, p.y);
        }
      }

      if (p.dead && p.explode > 0) {
        this.explodeAt(p.x, p.y, p.explode, p.explodeDamage);
        p.explode = 0;
      }
    }

    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  private chainLightning(source: Projectile, first: Enemy): void {
    let from = first;
    let remaining = source.chain;
    const hit = new Set<number>([first.id]);
    while (remaining > 0) {
      const next = this.nearestEnemy(from.x, from.y, hit, 190);
      if (!next) break;
      hit.add(next.id);
      this.particles.burst(next.x, next.y, '#ffe066', 6, 160);
      this.damageEnemy(next, source.damage * 0.6, 0, 0, false);
      from = next;
      remaining -= 1;
    }
  }

  private explodeAt(x: number, y: number, radius: number, damage: number): void {
    this.particles.ring(x, y, '#ffb166', 18, 260);
    this.particles.burst(x, y, '#ff8a4a', 14, 200);
    this.sfx.explode();
    this.camera.shake(4, 3, 140);
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      if (Math.hypot(dx, dy) <= radius + enemy.r) {
        const len = Math.hypot(dx, dy) || 1;
        this.damageEnemy(enemy, damage, dx / len, dy / len, false);
      }
    }
    for (const p of this.projectiles) {
      if (p.owner === 'enemy' && !p.dead) {
        if (Math.hypot(p.x - x, p.y - y) <= radius) {
          p.dead = true;
        }
      }
    }
  }

  private nearestEnemy(x: number, y: number, exclude?: Set<number>, maxDist = Infinity): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = maxDist;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (exclude && exclude.has(enemy.id)) continue;
      const dist = Math.hypot(enemy.x - x, enemy.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = enemy;
      }
    }
    return best;
  }

  private damagePlayer(amount: number, srcX: number, srcY: number): void {
    if (this.player.invuln > 0 || this.run.isDead) return;
    if (!this.run.damage(amount)) return;

    this.player.invuln = CONFIG.PLAYER.invulnTime;
    this.player.hurtFlash = CONFIG.PLAYER.hurtFlashTime;
    const len = Math.hypot(this.player.x - srcX, this.player.y - srcY) || 1;
    this.player.vx = ((this.player.x - srcX) / len) * CONFIG.PLAYER.knockback;
    this.player.vy = ((this.player.y - srcY) / len) * CONFIG.PLAYER.knockback;
    this.hitstop = Math.max(this.hitstop, 0.06);
    this.hud.flash();
    this.camera.shake(6, 5, 220);
    this.sfx.hurt();
    this.particles.burst(this.player.x, this.player.y, '#ff6a5a', 10, 180);
    this.hud.update(this.run, this.room.name);

    if (this.run.isDead) {
      this.beginDeath();
    }
  }

  private beginDeath(): void {
    this.mode = 'dead';
    this.sfx.death();
    this.hud.toast('OUT OF HEARTS', 'bad');
    this.camera.shake(9, 7, 400);
    this.hud.showEnd(false, [
      `You reached depth ${this.run.depth}.`,
      `Chickens collected: ${this.run.owned.length}`,
      `Perks: ${this.run.perks.length}`,
    ]);
  }

  private onRoomCleared(): void {
    const node = this.node;
    node.cleared = true;
    this.run.roomsCleared += 1;
    if (this.run.mods.healOnRoomClear > 0) {
      this.run.heal(this.run.mods.healOnRoomClear);
      this.particles.text(this.player.x, this.player.y - 26, `+${this.run.mods.healOnRoomClear} ♥`, '#8fe3b0');
    }

    if (node.role === 'boss') {
      this.trapdoorOpen = true;
      this.hud.toast('THE NEST SEAL IS BROKEN');
    }

    if (node.role === 'combat' || node.role === 'boss' || node.role === 'start') {
      const plan = combatReward(node, this.rng, this.run.owned, this.run.perks);
      node.reward = plan;
      node.rewardPending = true;
      const tile = this.findOpenTile(this.room, Math.floor(this.room.width / 2), Math.floor(this.room.height / 2));
      this.addPedestal(this.pedestalKindFor(plan), tile.x, tile.y, plan);
      this.particles.ring(this.pedestals[this.pedestals.length - 1]!.x, this.pedestals[this.pedestals.length - 1]!.y, '#ffd54a', 16, 180);
      this.hud.toast('ROOM CLEARED');
    }

    this.hud.update(this.run, this.room.name);
  }

  // -------------------------------------------------------------- collectibles

  private handlePedestals(input: ReturnType<InputMap['sample']>): void {
    const radius = this.run.pickupRadius;
    let prompt: string | null = null;

    for (const pedestal of this.pedestals) {
      if (pedestal.taken || pedestal.sold) continue;
      const dist = Math.hypot(pedestal.x - this.player.x, pedestal.y - this.player.y);
      if (dist > radius) continue;

      if (pedestal.kind === 'shop') {
        const price = pedestal.price ?? 0;
        prompt = this.run.feed >= price
          ? `SPACE · buy ${pedestal.label ?? 'item'} (${price} feed)`
          : `${pedestal.label ?? 'item'} — need ${price} feed`;
        if (input.interactPressed && this.run.feed >= price) {
          if (this.run.spendFeed(price)) {
            this.applyReward(pedestal.plan ?? { kind: 'feed', amount: 20 });
            pedestal.sold = true;
            if (this.node.shop && pedestal.shopIndex !== undefined) {
              const entry = this.node.shop[pedestal.shopIndex];
              if (entry) entry.sold = true;
            }
            this.sfx.buy();
            this.hud.update(this.run, this.room.name);
          } else {
            this.sfx.denied();
          }
        }
        continue;
      }

      // Free pickups are collected on touch.
      this.applyReward(pedestal.plan ?? { kind: 'feed', amount: 10 });
      pedestal.taken = true;
      if (pedestal.plan === this.node.reward) {
        this.node.rewardPending = false;
      }
      this.particles.ring(pedestal.x, pedestal.y, '#ffe8a0', 14, 160);
    }

    this.hud.showShopPrompt(prompt);
  }

  private applyReward(plan: RewardPlan): void {
    switch (plan.kind) {
      case 'chicken': {
        const id = plan.chickenId ?? rollChicken(this.run.owned, this.rng).id;
        const slot = this.run.addChicken(id);
        const def = CHICKEN_BY_ID[id];
        const name = def?.name ?? 'Chicken';
        const message =
          slot >= 0
            ? `${name} joined the stack (${DIRS[slot]})`
            : `${name} joined the flock (stack full)`;
        this.hud.toast(message, 'good');
        this.sfx.chicken();
        break;
      }
      case 'perk': {
        const perkId = plan.perkId ?? rollPerk(this.run.perks, this.rng)?.id;
        if (perkId) {
          this.run.takePerk(perkId);
          this.hud.toast(`Perk: ${perkId.replace('-', ' ')}`, 'good');
          this.sfx.perk();
        }
        break;
      }
      case 'feed': {
        const amount = plan.amount ?? 20;
        this.run.addFeed(amount);
        this.particles.text(this.player.x, this.player.y - 24, `+${amount} feed`, '#f6d76c');
        this.sfx.feed();
        break;
      }
      case 'heart': {
        if (this.run.health < this.run.maxHealth) {
          this.run.heal(1);
          this.hud.toast('+1 heart', 'good');
        } else {
          this.run.maxHealth += 1;
          this.run.heal(1);
          this.hud.toast('+1 max heart', 'good');
        }
        this.sfx.pickup();
        break;
      }
    }
    this.hud.update(this.run, this.room.name);
  }

  private handleTrapdoor(): void {
    if (!this.node.hasTrapdoor) return;
    const tile = this.findOpenTile(this.room, Math.floor(this.room.width / 2), Math.floor(this.room.height / 2));
    const x = (tile.x + 0.5) * TILE;
    const y = (tile.y + 0.5) * TILE;
    if (Math.hypot(x - this.player.x, y - this.player.y) < 30) {
      if (this.trapdoorOpen) {
        this.nextFloor();
      } else if (this.time % 1 < 0.02) {
        this.hud.toast('THE NEST IS SEALED — DEFEAT THE FAT ROOSTER', 'bad');
      }
    }
  }

  private isBossCleared(): boolean {
    const boss = this.dungeon.nodes.get(this.dungeon.bossKey);
    return !!boss?.cleared;
  }

  private nextFloor(): void {
    this.run.depth += 1;
    this.sfx.trapdoor();
    if (this.run.depth > CONFIG.RUN.floorsToWin) {
      this.mode = 'victory';
      this.sfx.win();
      this.hud.showEnd(true, [
        `You cleared ${CONFIG.RUN.floorsToWin} nests.`,
        `Chickens collected: ${this.run.owned.length}`,
        `Feed banked: ${this.run.feed}`,
      ]);
      return;
    }
    this.hud.toast(`DEPTH ${this.run.depth}`);
    this.dungeon = this.buildDungeon();
    this.rng = mulberry32(this.run.seed ^ (this.run.depth * 0x9e3779b1));
    const start = this.dungeon.nodes.get(this.dungeon.startKey)!;
    this.enterNode(start, null, true);
  }

  // -------------------------------------------------------------------- doors

  private handleDoors(): void {
    if (this.doorCooldown > 0) return;
    const w = roomPixelWidth(this.room);
    const h = roomPixelHeight(this.room);
    const reach = TILE * 0.62;

    let side: DoorSide | null = null;
    if (this.player.x < reach && this.node.doors.includes('left')) side = 'left';
    else if (this.player.x > w - reach && this.node.doors.includes('right')) side = 'right';
    else if (this.player.y < reach && this.node.doors.includes('up')) side = 'up';
    else if (this.player.y > h - reach && this.node.doors.includes('down')) side = 'down';
    if (!side) return;

    const neighbor = this.dungeon.nodes.get(neighborKey(this.node, side));
    if (!neighbor) return;
    this.enterNode(neighbor, OPPOSITE[side]);
  }

  // ---------------------------------------------------------------------- UI

  private toggleOverlay(which: 'stack' | 'perks' | 'map'): void {
    if (this.mode === 'menu' || this.mode === 'dead' || this.mode === 'victory') return;
    if (this.mode === which) {
      this.closeOverlay();
      return;
    }
    this.mode = which;
    this.stackSelection = null;
    if (which === 'map') {
      this.hud.showMap(this.dungeon, this.node.key, this.visitedKeys());
    } else if (which === 'stack') {
      this.hud.showStack(this.run, this.stackSelection, {
        selectInventory: (index) => this.onSelectInventory(index),
        selectSlot: (slot) => this.onSelectSlot(slot),
        close: () => this.closeOverlay(),
      });
    } else {
      this.hud.showPerks(this.run, () => this.closeOverlay());
    }
  }

  /** Q/E: turn the ring. Only while playing, so menus and overlays are untouched. */
  private rotateStack(clockwise: boolean): void {
    if (this.mode !== 'play') return;
    this.run.rotateStack(clockwise);
    this.sfx.pickup();
  }

  /** Room keys the player has entered on this floor. */
  private visitedKeys(): Set<string> {
    const keys = new Set<string>();
    for (const node of this.dungeon.nodes.values()) {
      if (node.visited) keys.add(node.key);
    }
    return keys;
  }

  closeOverlay(): void {
    this.mode = 'play';
    this.hud.closeOverlay();
  }

  private onSelectInventory(index: number): void {
    if (this.stackSelection?.kind === 'inventory' && this.stackSelection.index === index) {
      this.stackSelection = null;
    } else {
      this.stackSelection = { kind: 'inventory', index };
    }
    this.refreshStackGui();
  }

  private onSelectSlot(slot: number): void {
    const selection = this.stackSelection;
    if (selection?.kind === 'slot') {
      if (selection.slot === slot) {
        // Click the same slot again to deselect.
        this.stackSelection = null;
      } else {
        // Two different slots: swap the chickens between them.
        this.run.swapSlots(selection.slot, slot);
        this.stackSelection = null;
        this.sfx.pickup();
        this.hud.toast('Chickens swapped');
      }
    } else if (selection?.kind === 'inventory') {
      const id = this.run.owned[selection.index] ?? null;
      if (id) {
        this.run.setSlot(slot, id);
      }
      this.stackSelection = null;
    } else {
      this.stackSelection = { kind: 'slot', slot };
    }
    this.refreshStackGui();
    this.hud.update(this.run, this.room.name);
  }

  private refreshStackGui(): void {
    this.hud.showStack(this.run, this.stackSelection, {
      selectInventory: (index) => this.onSelectInventory(index),
      selectSlot: (slot) => this.onSelectSlot(slot),
      close: () => this.closeOverlay(),
    });
  }

  private updateHud(dt: number): void {
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.06;
      this.hud.update(this.run, this.room.name);
    }
    if (this.debug) {
      this.debugTimer -= dt;
      if (this.debugTimer <= 0) {
        this.debugTimer = 0.12;
        this.hud.setDebugText(this.debugText());
      }
    }
  }

  private toggleDebug(): void {
    this.debug = !this.debug;
    this.engine.toggleDebug();
    this.hud.setDebugVisible(this.debug);
    if (this.debug) {
      this.hud.setDebugText(this.debugText());
    }
  }

  /** Shows the seed menu. The run is paused until the player starts one. */
  private showMenu(): void {
    this.mode = 'menu';
    this.hud.hideEnd();
    this.hud.closeOverlay();
    this.hud.showMenu((text) => this.startRun(text));
  }

  /** Starts a fresh run from the seed text; blank means a random seed. */
  private startRun(seedText: string): void {
    const seed = seedText.trim() === '' ? Math.floor(Math.random() * 0xffffffff) : seedFromText(seedText);
    this.hud.hideMenu();
    this.run.reset(seed >>> 0);
    this.rng = mulberry32(this.run.seed ^ 0x51ed270b);
    this.dungeon = this.buildDungeon();
    this.mode = 'play';
    this.hud.hideEnd();
    this.hud.closeOverlay();
    this.particles.clear();
    this.enemyIdCounter = 0;
    const start = this.dungeon.nodes.get(this.dungeon.startKey)!;
    this.enterNode(start, null, true);
    this.hud.toast(`SEED ${this.run.seed}`);
  }

  private restart(): void {
    // Typing in the seed box also sends key presses; ignore them on the menu.
    if (this.mode === 'menu') return;
    this.showMenu();
  }

  private debugText(): string {
    const stats = this.engine.stats.currFrame;
    return [
      `fps     ${stats.fps.toFixed(0)}`,
      `mode    ${this.mode}`,
      `room    ${this.node?.key ?? '-'} ${this.node?.role ?? ''}`,
      `depth   ${this.run.depth}`,
      `health  ${this.run.health}/${this.run.maxHealth}`,
      `feed    ${this.run.feed}`,
      `stack   ${this.run.stack.slots.map((s) => s ?? '-').join(',')}`,
      `perks   ${this.run.perks.length}`,
      `enemies ${this.enemies.filter((e) => !e.dead).length}`,
      `shots   ${this.projectiles.length}`,
      `doors   ${this.node?.doors.join(',') ?? '-'}`,
      `pos     ${this.player.x.toFixed(0)}, ${this.player.y.toFixed(0)}`,
    ].join('\n');
  }

  // ------------------------------------------------------------------ drawing

  private drawWorld(ctx: CanvasRenderingContext2D): void {
    const w = roomPixelWidth(this.room);
    const h = roomPixelHeight(this.room);
    ctx.clearRect(0, 0, w, h);

    if (this.terrain) {
      ctx.drawImage(this.terrain, 0, 0);
    }

    // Door mats
    for (const side of this.node.doors) {
      const open = !!this.dungeon.nodes.get(neighborKey(this.node, side));
      const tile = doorCenterTile(this.room, side);
      const x = (tile.x + 0.5) * TILE;
      const y = (tile.y + 0.5) * TILE;
      drawDoorMat(ctx, x, y, side, open, this.time);
    }

    if (this.node.hasTrapdoor) {
      const tile = this.findOpenTile(this.room, Math.floor(this.room.width / 2), Math.floor(this.room.height / 2));
      drawTrapdoor(ctx, (tile.x + 0.5) * TILE, (tile.y + 0.5) * TILE, this.time, this.trapdoorOpen);
    }

    for (const pedestal of this.pedestals) {
      if (pedestal.taken) continue;
      drawPedestal(ctx, pedestal.kind, pedestal.x, pedestal.y, this.time, {
        chickenId: pedestal.chickenId,
        price: pedestal.price,
        sold: pedestal.sold,
        label: pedestal.label,
      });
    }

    const sorted = [...this.enemies].sort((a, b) => a.y - b.y);
    for (const enemy of sorted) {
      drawEnemy(ctx, enemy, this.time);
    }

    for (const p of this.projectiles) {
      drawProjectile(ctx, p, this.time);
    }

    if (this.mode !== 'victory' && this.run.health > 0) {
      const blink = this.player.invuln > 0 && Math.sin(this.time * 40) > 0;
      if (!blink) {
        drawPlayer(
          ctx,
          {
            x: this.player.x,
            y: this.player.y,
            facingX: this.player.facingX,
            facingY: this.player.facingY,
            hurtFlash: this.player.hurtFlash,
            inWater: this.player.inWater,
            stack: DIRS.map((_, i) => {
              const id = this.run.stack.slots[i];
              return id ? CHICKEN_BY_ID[id] ?? null : null;
            }),
            cooldownFrac: DIRS.map((_, i) => {
              const id = this.run.stack.slots[i];
              if (!id) return 1;
              const def = CHICKEN_BY_ID[id];
              if (!def) return 1;
              const max = def.cooldown / this.run.mods.fireRateMul;
              return clamp(1 - (this.player.slotCooldown[i] ?? 0) / max, 0, 1);
            }),
            recoil: this.slotRecoil,
          },
          this.time,
        );
      }
    }

    this.particles.draw(ctx);
  }
}
