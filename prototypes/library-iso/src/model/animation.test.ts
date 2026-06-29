import { describe, expect, it } from 'vitest';
import { getAvatarMotionSpec } from './animation';

describe('avatar animation feel', () => {
  it('uses a faster walk cadence with a subtle pixel-art step pulse', () => {
    expect(getAvatarMotionSpec('walk')).toEqual({
      frameRate: 7,
      scalePulse: {
        durationMs: 150,
        scaleX: 0.97,
        scaleY: 1.03,
      },
    });
  });

  it('keeps idle and sit poses stable so seated studying does not wobble', () => {
    expect(getAvatarMotionSpec('idle').scalePulse).toBeNull();
    expect(getAvatarMotionSpec('sit').scalePulse).toBeNull();
  });
});
