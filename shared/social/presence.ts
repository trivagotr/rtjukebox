import type {SocialRoomId} from './socialSpaces';

export type AvatarPosition = {
  x: number;
  y: number;
  posture: 'standing' | 'walking' | 'sitting';
  seatId?: string | null;
};

export type SeatOccupancyEvent = {
  type: 'room:sit';
  roomId: SocialRoomId;
  userId: string;
  seatId: string;
};

export type RoomPresenceEvent =
  | {
      type: 'room:join' | 'room:leave';
      roomId: SocialRoomId;
      userId: string;
    }
  | {
      type: 'room:move';
      roomId: SocialRoomId;
      userId: string;
      position: AvatarPosition;
    }
  | SeatOccupancyEvent;

export function buildSeatOccupancyEvent(input: {
  roomId: SocialRoomId;
  userId: string;
  seatId: string;
}): SeatOccupancyEvent {
  return {
    type: 'room:sit',
    roomId: input.roomId,
    userId: input.userId,
    seatId: input.seatId,
  };
}
