import { Keys, type Engine, type KeyEvent } from 'excalibur';
import type { PlayerInput } from '../entities/player';

export interface InputCallbacks {
  onToggleStack: () => void;
  onRotateStack: (clockwise: boolean) => void;
  onTogglePerks: () => void;
  onToggleMap: () => void;
  onRestart: () => void;
  onToggleDebug: () => void;
}

/**
 * WASD moves, Space fires every equipped chicken, F interacts, Q/E rotate the stack. Overlay hotkeys
 * are handled on the keydown edge so a quick tap is never dropped.
 */
export class InputMap {
  private interactLatch = false;

  constructor(
    private readonly engine: Engine,
    private readonly callbacks: InputCallbacks,
  ) {
    this.engine.input.keyboard.on('press', this.handlePress);
  }

  sample(): PlayerInput {
    const keyboard = this.engine.input.keyboard;
    const moveX = (keyboard.isHeld(Keys.D) ? 1 : 0) - (keyboard.isHeld(Keys.A) ? 1 : 0);
    const moveY = (keyboard.isHeld(Keys.S) ? 1 : 0) - (keyboard.isHeld(Keys.W) ? 1 : 0);

    const shoot = keyboard.isHeld(Keys.Space);
    const interact = keyboard.isHeld(Keys.F);
    const interactPressed = this.interactLatch;
    this.interactLatch = false;

    return { moveX, moveY, shoot, interact, interactPressed };
  }

  private readonly handlePress = (event: KeyEvent): void => {
    switch (event.key) {
      case Keys.Tab:
        this.callbacks.onToggleStack();
        break;
      case Keys.E:
        this.callbacks.onRotateStack(true);
        break;
      case Keys.Q:
        this.callbacks.onRotateStack(false);
        break;
      case Keys.P:
        this.callbacks.onTogglePerks();
        break;
      case Keys.M:
        this.callbacks.onToggleMap();
        break;
      case Keys.F:
        this.interactLatch = true;
        break;
      case Keys.F1:
        this.callbacks.onToggleDebug();
        break;
      case Keys.R:
        this.callbacks.onRestart();
        break;
    }
  };
}
