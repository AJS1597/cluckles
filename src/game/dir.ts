/** Cardinal directions, clockwise starting from up. This order matters: the
 * chicken stack fills slots in this order so the ring reads clockwise. */
export type Dir = 'up' | 'right' | 'down' | 'left';

export const DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];

export const DIR_VEC: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export function dirAngle(dir: Dir): number {
  switch (dir) {
    case 'up':
      return -Math.PI / 2;
    case 'right':
      return 0;
    case 'down':
      return Math.PI / 2;
    case 'left':
      return Math.PI;
  }
}
