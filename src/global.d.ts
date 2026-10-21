import type * as CONFIG from './game/config';
import type { GameScene } from './game/scenes/GameScene';
import type { RunState } from './game/systems/run';

declare global {
  interface Window {
    __cluck?: {
      scene: GameScene;
      run: RunState;
      config: typeof CONFIG;
    };
  }
}

export {};
