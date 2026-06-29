import type { AvatarDirection, AvatarPose } from './movement';
import type { TileXY } from './iso';

export type RoomUserStatus = 'Studying' | 'Reading' | 'Idle';

export type RoomUser = {
  id: string;
  name: string;
  status: RoomUserStatus;
};

export type AmbientStudent = {
  userId: string;
  tile: TileXY;
  dir: AvatarDirection;
  pose: AvatarPose;
  seatId: string | null;
  bubbleText?: string;
};

export type ChatMessage = {
  id: string;
  userId: string;
  text: string;
  createdAtMs: number;
  expiresAtMs: number;
};

export type RoomPresence = {
  activeUserId: string;
  roomUserCount: number;
  studyingCount: number;
  statusLabel: RoomUserStatus;
};

const CHAT_VISIBLE_MS = 6000;

export const ROOM_USERS: RoomUser[] = [
  { id: 'local', name: 'Akgul', status: 'Studying' },
  { id: 'mira', name: 'Mira', status: 'Studying' },
  { id: 'jules', name: 'Jules', status: 'Reading' },
  { id: 'nora', name: 'Nora', status: 'Studying' },
];

export const NPC_STUDENTS: AmbientStudent[] = [
  {
    userId: 'mira',
    tile: { x: 7, y: 5 },
    dir: 'south',
    pose: 'sit',
    seatId: 'front-right',
    bubbleText: 'One pomodoro, then notes.',
  },
  {
    userId: 'jules',
    tile: { x: 8, y: 4 },
    dir: 'south-west',
    pose: 'idle',
    seatId: null,
  },
  {
    userId: 'nora',
    tile: { x: 4, y: 8 },
    dir: 'south',
    pose: 'sit',
    seatId: 'lower-left',
    bubbleText: 'Quiet room is perfect.',
  },
];

export function createChatMessage(input: Omit<ChatMessage, 'expiresAtMs'>): ChatMessage {
  return {
    ...input,
    text: input.text.trim(),
    expiresAtMs: input.createdAtMs + CHAT_VISIBLE_MS,
  };
}

export function getActiveChatMessages(messages: ChatMessage[], nowMs: number): ChatMessage[] {
  return messages.filter((message) => message.expiresAtMs > nowMs);
}

export function getRoomPresence(users: RoomUser[], activeUserId: string): RoomPresence {
  const activeUser = users.find((user) => user.id === activeUserId);

  return {
    activeUserId,
    roomUserCount: users.length,
    studyingCount: users.filter((user) => user.status === 'Studying').length,
    statusLabel: activeUser?.status ?? 'Idle',
  };
}
