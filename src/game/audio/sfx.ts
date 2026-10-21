/** Small synthesized sound effects. No assets, no dependencies. */
export class Sfx {
  private ctx: AudioContext | null = null;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        this.ctx = new Ctor();
      }
    } catch {
      this.ctx = null;
    }
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), ctx.currentTime + duration);
    }
    amp.gain.setValueAtTime(gain, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  shoot(): void {
    this.tone(660, 0.07, 'square', 0.05, 320);
  }

  hit(): void {
    this.tone(220, 0.09, 'square', 0.06, 120);
  }

  explode(): void {
    this.tone(140, 0.28, 'sawtooth', 0.09, 40);
  }

  pickup(): void {
    this.tone(880, 0.1, 'triangle', 0.07, 1320);
  }

  feed(): void {
    this.tone(1046, 0.07, 'triangle', 0.05, 1568);
  }

  buy(): void {
    this.tone(523, 0.09, 'triangle', 0.07, 784);
    window.setTimeout(() => this.tone(784, 0.12, 'triangle', 0.06, 1046), 80);
  }

  denied(): void {
    this.tone(200, 0.16, 'square', 0.06, 120);
  }

  hurt(): void {
    this.tone(300, 0.22, 'sawtooth', 0.08, 90);
  }

  death(): void {
    this.tone(400, 0.7, 'sawtooth', 0.09, 60);
  }

  door(): void {
    this.tone(520, 0.14, 'triangle', 0.06, 300);
  }

  perk(): void {
    this.tone(600, 0.14, 'triangle', 0.07, 900);
    window.setTimeout(() => this.tone(900, 0.2, 'triangle', 0.06, 1200), 110);
  }

  chicken(): void {
    this.tone(760, 0.08, 'square', 0.05, 1200);
    window.setTimeout(() => this.tone(900, 0.1, 'square', 0.05, 1400), 70);
  }

  trapdoor(): void {
    this.tone(180, 0.3, 'triangle', 0.08, 90);
  }

  win(): void {
    [523, 659, 784, 1046].forEach((freq, i) => {
      window.setTimeout(() => this.tone(freq, 0.3, 'triangle', 0.07), i * 130);
    });
  }
}
