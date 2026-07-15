export type StudyPhysicalRoomId = 'library' | 'chim-alan';

export const STUDY_ROOM_CAPACITIES: Readonly<Record<StudyPhysicalRoomId, number>> = Object.freeze({
  library: 51,
  'chim-alan': 9,
});

export interface StudyInstanceOccupancy {
  instanceId: string;
  occupancy: number;
}

export interface StudyRoomInstance {
  id: string;
  roomId: StudyPhysicalRoomId;
  number: number;
  occupancy: number;
  capacity: number;
  preferredInstanceFull: boolean;
}

export function parseStudyRoomInstanceId(value: unknown, roomId: StudyPhysicalRoomId) {
  if (typeof value !== 'string') return null;
  const match = /^(library|chim-alan)-([1-9][0-9]{0,3})$/.exec(value);
  if (!match || match[1] !== roomId) return null;
  return { roomId, number: Number(match[2]) } as const;
}

function instanceResult(
  roomId: StudyPhysicalRoomId,
  number: number,
  occupancy: number,
  preferredInstanceFull: boolean,
): StudyRoomInstance {
  return {
    id: `${roomId}-${number}`,
    roomId,
    number,
    occupancy,
    capacity: STUDY_ROOM_CAPACITIES[roomId],
    preferredInstanceFull,
  };
}

export function selectStudyRoomInstance(
  roomId: StudyPhysicalRoomId,
  occupancies: readonly StudyInstanceOccupancy[],
  preferredInstanceId?: string | null,
): StudyRoomInstance {
  const capacity = STUDY_ROOM_CAPACITIES[roomId];
  const byNumber = new Map<number, number>();
  for (const row of occupancies) {
    const parsed = parseStudyRoomInstanceId(row.instanceId, roomId);
    if (!parsed) continue;
    const occupancy = Number.isFinite(row.occupancy) ? Math.max(0, Math.floor(row.occupancy)) : capacity;
    byNumber.set(parsed.number, Math.max(byNumber.get(parsed.number) ?? 0, occupancy));
  }

  let preferredInstanceFull = false;
  if (preferredInstanceId) {
    const preferred = parseStudyRoomInstanceId(preferredInstanceId, roomId);
    if (!preferred) throw new Error('INVALID_STUDY_INSTANCE_ID');
    const occupancy = byNumber.get(preferred.number) ?? 0;
    if (occupancy < capacity) return instanceResult(roomId, preferred.number, occupancy, false);
    preferredInstanceFull = true;
  }

  const highestKnown = Math.max(0, ...byNumber.keys());
  for (let number = 1; number <= highestKnown + 1; number += 1) {
    const occupancy = byNumber.get(number) ?? 0;
    if (occupancy < capacity) return instanceResult(roomId, number, occupancy, preferredInstanceFull);
  }

  return instanceResult(roomId, 1, 0, preferredInstanceFull);
}
