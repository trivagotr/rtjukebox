export type TilePoint = {x: number; y: number};
export type SeatFacing = 'west' | 'east' | 'north' | 'south';
export type SeatPose = 'sit-left' | 'sit-right' | 'sit-front';

export type SeatSlot = {
  id: string;
  entryTile: TilePoint;
  sitTile: TilePoint;
  facing: SeatFacing;
  pose: SeatPose;
  occlusionLayer: 'front-edge' | 'none';
};

export function resolveSeatSlot(slots: SeatSlot[], seatId: string): SeatSlot | undefined {
  return slots.find(slot => slot.id === seatId);
}

export function seatSlotToAvatarPose(slot: SeatSlot) {
  return {
    posture: 'sitting' as const,
    pose: slot.pose,
    facing: slot.facing,
  };
}
