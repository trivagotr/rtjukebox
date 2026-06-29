import { describe, expect, it } from 'vitest';
import {
  NPC_STUDENTS,
  ROOM_USERS,
  createChatMessage,
  getActiveChatMessages,
  getRoomPresence,
} from './social';

describe('room social model', () => {
  it('declares local and ambient study users for a lived-in room', () => {
    expect(ROOM_USERS.map((user) => user.id)).toEqual(['local', 'mira', 'jules', 'nora']);
    expect(NPC_STUDENTS).toHaveLength(3);
    expect(NPC_STUDENTS.map((student) => student.pose)).toEqual(['sit', 'idle', 'sit']);
  });

  it('creates chat messages that expire while preserving avatar attachment', () => {
    const message = createChatMessage({
      id: 'msg-1',
      userId: 'local',
      text: 'Deep work sprint?',
      createdAtMs: 1000,
    });

    expect(message).toMatchObject({
      id: 'msg-1',
      userId: 'local',
      text: 'Deep work sprint?',
      expiresAtMs: 7000,
    });
    expect(getActiveChatMessages([message], 6999)).toHaveLength(1);
    expect(getActiveChatMessages([message], 7000)).toHaveLength(0);
  });

  it('summarizes current study presence for the HUD', () => {
    expect(getRoomPresence(ROOM_USERS, 'local')).toEqual({
      activeUserId: 'local',
      roomUserCount: 4,
      studyingCount: 3,
      statusLabel: 'Studying',
    });
  });
});
