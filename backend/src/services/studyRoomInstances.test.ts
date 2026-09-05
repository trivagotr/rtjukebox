import { describe, expect, it } from 'vitest';
import {
  STUDY_ROOM_CAPACITIES,
  parseStudyRoomInstanceId,
  selectStudyRoomInstance,
} from './studyRoomInstances';

describe('Study room overflow instances', () => {
  it('keeps every shared room together until the 60-player server limit', () => {
    expect(STUDY_ROOM_CAPACITIES).toEqual({
      library: 60,
      'chim-alan': 60,
      'grass-amphitheatre': 60,
      'sports-center': 60,
      auditorium: 60,
      'learning-lab': 60,
      'sca-office': 60,
    });
  });

  it('starts an empty physical room at instance one', () => {
    expect(selectStudyRoomInstance('library', [])).toEqual({
      id: 'library-1', roomId: 'library', number: 1,
      occupancy: 0, capacity: 60, preferredInstanceFull: false,
    });
  });

  it('keeps the 60th user in room one and sends user 61 to room two', () => {
    expect(selectStudyRoomInstance('library', [{ instanceId: 'library-1', occupancy: 59 }]).id).toBe('library-1');
    expect(selectStudyRoomInstance('library', [{ instanceId: 'library-1', occupancy: 60 }])).toEqual({
      id: 'library-2', roomId: 'library', number: 2,
      occupancy: 0, capacity: 60, preferredInstanceFull: false,
    });
  });

  it('uses the same 60-player boundary for Çim Alan', () => {
    expect(selectStudyRoomInstance('chim-alan', [{ instanceId: 'chim-alan-1', occupancy: 60 }]).id).toBe('chim-alan-2');
  });

  it('assigns the grass amphitheatre through the same stable instance contract', () => {
    expect(selectStudyRoomInstance('grass-amphitheatre', [])).toEqual({
      id: 'grass-amphitheatre-1', roomId: 'grass-amphitheatre', number: 1,
      occupancy: 0, capacity: 60, preferredInstanceFull: false,
    });
  });

  it('reuses the lowest missing instance number', () => {
    expect(selectStudyRoomInstance('library', [
      { instanceId: 'library-1', occupancy: 60 },
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
      { instanceId: 'library-1', occupancy: 60 },
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
