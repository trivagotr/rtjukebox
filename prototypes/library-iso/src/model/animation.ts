import type { AvatarPose } from './movement';

export type AvatarMotionSpec = {
  frameRate: number;
  scalePulse: {
    durationMs: number;
    scaleX: number;
    scaleY: number;
  } | null;
};

const MOTION_SPECS: Record<AvatarPose, AvatarMotionSpec> = {
  idle: {
    frameRate: 1,
    scalePulse: null,
  },
  walk: {
    frameRate: 7,
    scalePulse: {
      durationMs: 150,
      scaleX: 0.97,
      scaleY: 1.03,
    },
  },
  sit: {
    frameRate: 1,
    scalePulse: null,
  },
};

export function getAvatarMotionSpec(pose: AvatarPose): AvatarMotionSpec {
  return MOTION_SPECS[pose];
}
