import { CHICKEN_BY_ID } from '../chickens/chickens';
import { PERK_BY_ID } from '../perks/perks';
import { DIRS, type Dir } from '../dir';
import type { RunState } from '../systems/run';
import type { Dungeon } from '../level/dungeon';

const DIR_GLYPH: Record<Dir, string> = {
  up: '▲',
  right: '▶',
  down: '▼',
  left: '◀',
};

export interface StackHandlers {
  selectInventory: (index: number) => void;
  selectSlot: (slot: number) => void;
  close: () => void;
}

const MAP_ROLE_LABEL: Record<string, string> = {
  start: 'S',
  combat: '',
  treasure: 'T',
  shop: '$',
  boss: 'B',
  exit: '↓',
};

export type StackSelection = { kind: 'inventory'; index: number } | { kind: 'slot'; slot: number } | null;

/**
 * The DOM HUD and the two GUI subpages (chicken stack, perks). Keeping these in
 * HTML/CSS instead of the canvas keeps text crisp and theming trivial.
 */
export class Hud {
  private readonly hearts: HTMLElement;
  private readonly feedValue: HTMLElement;
  private readonly depthValue: HTMLElement;
  private readonly roomName: HTMLElement;
  private readonly stackRing: HTMLElement;
  private readonly perkStrip: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly shopPrompt: HTMLElement;
  private readonly debugEl: HTMLElement;
  private readonly debugBody: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly overlayPanel: HTMLElement;
  private readonly endScreen: HTMLElement;
  private readonly endTitle: HTMLElement;
  private readonly endText: HTMLElement;
  private readonly endButton: HTMLButtonElement;
  private readonly flashEl: HTMLElement;


  constructor(onNewRun: () => void) {
    this.hearts = must('hearts');
    this.feedValue = must('feed-value');
    this.depthValue = must('depth-value');
    this.roomName = must('room-name');
    this.stackRing = must('stack-ring');
    this.perkStrip = must('perk-strip');
    this.toastEl = must('toast');
    this.shopPrompt = must('shop-prompt');
    this.debugEl = must('debug');
    this.debugBody = must('debug-body');
    this.overlay = must('overlay');
    this.overlayPanel = must('overlay-panel');
    this.endScreen = must('endscreen');
    this.endTitle = must('end-title');
    this.endText = must('end-text');
    this.endButton = must('end-button') as HTMLButtonElement;
    this.flashEl = must('flash');

    this.endButton.addEventListener('click', onNewRun);
  }

  update(run: RunState, roomName: string): void {
    this.renderHearts(run.health, run.maxHealth);
    this.feedValue.textContent = String(run.feed);
    this.depthValue.textContent = String(run.depth);
    this.roomName.textContent = roomName;
    this.renderStackRing(run);
    this.renderPerkStrip(run);
  }

  private renderHearts(health: number, maxHealth: number): void {
    let html = '';
    for (let i = 0; i < maxHealth; i++) {
      html += `<span class="heart${i < health ? '' : ' empty'}">♥</span>`;
    }
    this.hearts.innerHTML = html;
  }

  private renderStackRing(run: RunState): void {
    let html = '';
    DIRS.forEach((dir, i) => {
      const id = run.stack.slots[i] ?? null;
      const def = id ? CHICKEN_BY_ID[id] : null;
      const color = def ? def.color : '#2b2b33';
      const ability = def ? def.ability : '—';
      html += `<div class="ring-slot ${def ? '' : 'empty'}" title="${def ? def.name : 'empty'}">
        <i class="ring-dir">${DIR_GLYPH[dir]}</i>
        <span class="ring-dot" style="background:${color}"></span>
        <span class="ring-ability">${ability}</span>
      </div>`;
    });
    this.stackRing.innerHTML = html;
  }

  private renderPerkStrip(run: RunState): void {
    if (run.perks.length === 0) {
      this.perkStrip.innerHTML = '<span class="perk-empty">no perks yet</span>';
      return;
    }
    this.perkStrip.innerHTML = run.perks
      .map((id) => {
        const perk = PERK_BY_ID[id];
        const color = perk?.color ?? '#888';
        const name = perk?.name ?? id;
        return `<span class="perk-chip" style="border-color:${color}" title="${perk?.blurb ?? ''}">${name}</span>`;
      })
      .join('');
  }

  toast(message: string, kind: 'normal' | 'bad' | 'good' = 'normal'): void {
    this.toastEl.textContent = message;
    this.toastEl.className = `toast show ${kind}`;

    window.clearTimeout((this as unknown as { _t?: number })._t);
    (this as unknown as { _t?: number })._t = window.setTimeout(() => {
      this.toastEl.className = 'toast';
    }, 2400);
  }

  flash(): void {
    this.flashEl.classList.remove('active');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('active');
  }

  setDebugVisible(visible: boolean): void {
    this.debugEl.hidden = !visible;
  }

  setDebugText(text: string): void {
    this.debugBody.textContent = text;
  }

  showShopPrompt(text: string | null): void {
    if (text) {
      this.shopPrompt.textContent = text;
      this.shopPrompt.hidden = false;
    } else {
      this.shopPrompt.hidden = true;
    }
  }

  get overlayOpen(): boolean {
    return !this.overlay.hidden;
  }

  closeOverlay(): void {
    this.overlay.hidden = true;
    this.overlayPanel.innerHTML = '';
  }

  private openOverlay(html: string): void {
    this.overlayPanel.innerHTML = html;
    this.overlay.hidden = false;
  }

  showStack(run: RunState, selection: StackSelection, handlers: StackHandlers): void {
    const ring = DIRS.map((dir, slot) => {
      const id = run.stack.slots[slot] ?? null;
      const def = id ? CHICKEN_BY_ID[id] : null;
      const selected = selection?.kind === 'slot' && selection.slot === slot ? 'selected' : '';
      const body = def
        ? `<span class="chip-dot" style="background:${def.color}"></span>
           <span class="chip-name">${def.name}</span>
           <span class="chip-tag">${def.ability}</span>`
        : '<span class="chip-empty">empty</span>';
      return `<button class="ring-card ${def ? '' : 'empty'} ${selected}" data-slot="${slot}">
        <span class="ring-card-dir">${DIR_GLYPH[dir]} ${dir}</span>
        ${body}
      </button>`;
    }).join('');

    const inventory = run.owned.length
      ? run.owned
          .map((id, index) => {
            const def = CHICKEN_BY_ID[id];
            const selected = selection?.kind === 'inventory' && selection.index === index ? 'selected' : '';
            const color = def?.color ?? '#888';
            return `<button class="inv-card ${selected}" data-index="${index}">
              <span class="chip-dot" style="background:${color}"></span>
              <span class="chip-name">${def?.name ?? id}</span>
              <span class="chip-tag">${def?.ability ?? '?'}</span>
            </button>`;
          })
          .join('')
      : '<p class="muted">No chickens yet. Clear rooms to find some.</p>';

    const detail = this.detailHtml(selection, run);

    this.openOverlay(`
      <div class="panel stack-panel">
        <header class="panel-head">
          <h2>Chicken Stack</h2>
          <button class="panel-close" data-close="1">close ✕</button>
        </header>
        <p class="muted">Slots fire clockwise from up: ▲ up · ▶ right · ▼ down · ◀ left. Click a chicken then a slot to equip it, or click two slots to swap them.</p>
        <div class="ring-row">${ring}</div>
        <h3>Your flock</h3>
        <div class="inv-row">${inventory}</div>
        <div class="detail">${detail}</div>
        <footer class="panel-foot"><span><kbd>TAB</kbd> or <kbd>ESC</kbd> to close</span></footer>
      </div>
    `);

    this.overlayPanel.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((el) => {
      el.addEventListener('click', () => handlers.selectSlot(Number(el.dataset['slot'])));
    });
    this.overlayPanel.querySelectorAll<HTMLButtonElement>('[data-index]').forEach((el) => {
      el.addEventListener('click', () => handlers.selectInventory(Number(el.dataset['index'])));
    });
    const close = this.overlayPanel.querySelector<HTMLButtonElement>('[data-close]');
    close?.addEventListener('click', () => handlers.close());
  }

  private detailHtml(selection: StackSelection, run: RunState): string {
    let chickenId: string | null = null;
    if (selection?.kind === 'slot') chickenId = run.stack.slots[selection.slot] ?? null;
    if (selection?.kind === 'inventory') chickenId = run.owned[selection.index] ?? null;
    if (!chickenId) return '<p class="muted">Select a chicken to read its stats.</p>';
    const def = CHICKEN_BY_ID[chickenId];
    if (!def) return '';
    const p = def.projectile;
    const stats = [
      `damage ${p.damage}`,
      `cooldown ${def.cooldown.toFixed(2)}s`,
      p.count && p.count > 1 ? `shots ${p.count}` : null,
      p.speed ? `speed ${p.speed}` : null,
      p.pierce && p.pierce > 0 ? 'pierces' : null,
      p.bounce && p.bounce > 0 ? 'bounces' : null,
      p.homing && p.homing > 0 ? 'homing' : null,
      p.explode && p.explode > 0 ? 'explodes' : null,
      p.phaseWalls ? 'phases walls' : null,
      p.boomerang ? 'returns' : null,
      p.slowFactor ? 'chills' : null,
      p.poisonDps ? 'poisons' : null,
      p.chain ? `chains ${p.chain}` : null,
    ].filter(Boolean);
    return `<h3>${def.name} <span class="chip-tag">${def.ability}</span></h3>
      <p>${def.blurb}</p>
      <p class="muted">${stats.join(' · ')}</p>`;
  }

  showPerks(run: RunState, onClose: () => void): void {
    const cards = run.perks.length
      ? run.perks
          .map((id) => {
            const perk = PERK_BY_ID[id];
            if (!perk) return '';
            return `<div class="perk-card" style="border-color:${perk.color}">
              <h4>${perk.name}</h4>
              <p>${perk.blurb}</p>
              <span class="rarity">${perk.rarity}</span>
            </div>`;
          })
          .join('')
      : '<p class="muted">No perks yet. Perk pedestals are purple.</p>';

    this.openOverlay(`
      <div class="panel perks-panel">
        <header class="panel-head">
          <h2>Perks</h2>
          <button class="panel-close" data-close="1">close ✕</button>
        </header>
        <p class="muted">Passive effects from this run. They stack.</p>
        <div class="perk-grid">${cards}</div>
        <footer class="panel-foot"><span><kbd>P</kbd> or <kbd>ESC</kbd> to close</span></footer>
      </div>
    `);
    this.overlayPanel.querySelector<HTMLButtonElement>('[data-close]')?.addEventListener('click', onClose);
  }

  showEnd(won: boolean, lines: string[]): void {
    this.endTitle.textContent = won ? 'THE NEST IS CLEARED' : 'YOU CLUCKED OUT';
    this.endTitle.className = won ? 'win' : 'lose';
    this.endText.innerHTML = lines.map((line) => `<span>${line}</span>`).join('<br />');
    this.endScreen.hidden = false;
  }

  hideEnd(): void {
    this.endScreen.hidden = true;
  }

  /** Shows the start menu; `onStart` receives the raw seed text (may be blank). */
  showMenu(onStart: (seedText: string) => void): void {
    const menu = must('menu');
    const form = must('seed-form') as HTMLFormElement;
    const input = must('seed-input') as HTMLInputElement;
    input.value = '';
    menu.hidden = false;
    form.onsubmit = (event) => {
      event.preventDefault();
      onStart(input.value);
    };
    input.focus();
  }

  /** Draws the floor map: only rooms in `visited` are shown; the current one is highlighted. */
  showMap(dungeon: Dungeon, currentKey: string, visited: Set<string>): void {
    const cells: string[] = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 7; col++) {
        const key = `${col},${row}`;
        const node = dungeon.nodes.get(key);
        let cls = 'map-cell hidden';
        let label = '';
        if (node && visited.has(key)) {
          cls = `map-cell ${node.role}`;
          if (key === currentKey) cls += ' current';
          label = MAP_ROLE_LABEL[node.role];
        } else if (node) {
          cls = 'map-cell unknown';
          label = '?';
        }
        cells.push(`<div class="${cls}">${label}</div>`);
      }
    }
    this.openOverlay(`
      <div class="panel map-panel">
        <header class="panel-head">
          <h2>Floor Map</h2>
          <button class="panel-close" data-close="1">close ✕</button>
        </header>
        <p class="muted">Rooms you have seen this floor. <span class="map-key">●</span> you are here · <span class="map-key">?</span> unexplored.</p>
        <div class="map-grid">${cells.join('')}</div>
        <footer class="panel-foot"><span><kbd>M</kbd> or <kbd>ESC</kbd> to close</span></footer>
      </div>
    `);
    this.overlayPanel.querySelector<HTMLButtonElement>('[data-close]')?.addEventListener('click', () => this.closeOverlay());
  }

  hideMenu(): void {
    must('menu').hidden = true;
  }
}

function must(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`HUD element #${id} is missing from the page`);
  }
  return el;
}
