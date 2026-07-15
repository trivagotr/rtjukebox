import { describe, expect, it } from 'vitest';
import {
  STUDY_ROOM_CAPACITIES,
  parseStudyRoomInstanceId,
  selectStudyRoomInstance,
} from './studyRoomInstances';

describe('Study room overflow instances', () => {
  it('uses the physical seat counts as hard capacities', () => {
    expect(STUDY_ROOM_CAPACITIES).toEqual({ library: 51, 'chim-alan': 9 });
  });

  it('starts an empty physical room at instance one', () => {
    expect(selectStudyRoomInstance('library', [])).toEqual({
      id: 'library-1', roomId: 'library', number: 1,
      occupancy: 0, capacity: 51, preferredInstanceFull: false,
    });
  });

  it('keeps the 51st Library user in room one and sends user 52 to room two', () => {
    expect(selectStudyRoomInstance('library', [{ instanceId: 'library-1', occupancy: 50 }]).id).toBe('library-1');
    expect(selectStudyRoomInstance('library', [{ instanceId: 'library-1', occupancy: 51 }])).toEqual({
      id: 'library-2', roomId: 'library', number: 2,
      occupancy: 0, capacity: 51, preferredInstanceFull: false,
    });
  });

  it('sends the 10th Çim Alan user to room two', () => {
    expect(selectStudyRoomInstance('chim-alan', [{ instanceId: 'chim-alan-1', occupancy: 9 }]).id).toBe('chim-alan-2');
  });

  it('reuses the lowest missing instance number', () => {
    expect(selectStudyRoomInstance('library', [
      { instanceId: 'library-1', occupancy: 51 },
      { instanceId: 'library-3', occupancy: 12 },
    ]).id).toBe('library-2');
  });

  it('honors a non-full preferred instance', () => {
    expect(selectStudyRoomInstance('library', [
      { instanceId: 'library-1', occupancy: 20 },
      { instanceId: 'library-2', occupancy: 10 },
    ], 'library-2')).toEqual(expect.objectContaining({
      id: 'library-2', occupancy: 10, preferredInstanceFull: false,
    }));
  });

  it('falls back when the preferred instance is full', () => {
    expect(selectStudyRoomInstance('library', [
      { instanceId: 'library-1', occupancy: 51 },
      { instanceId: 'library-2', occupancy: 8 },
    ], 'library-1')).toEqual(expect.objectContaining({
      id: 'library-2', occupancy: 8, preferredInstanceFull: true,
    }));
  });

  it('rejects invalid and cross-room instance identifiers', () => {
    expect(parseStudyRoomInstanceId('library-2', 'library')).toEqual({ roomId: 'library', number: 2 });
    expect(parseStudyRoomInstanceId('chim-alan-2', 'library')).toBeNull();
    expect(parseStudyRoomInstanceId('library-0', 'library')).toBeNull();
    expect(() => selectStudyRoomInstance('library', [], 'chim-alan-1')).toThrow(/INVALID_STUDY_INSTANCE_ID/);
  });
});
