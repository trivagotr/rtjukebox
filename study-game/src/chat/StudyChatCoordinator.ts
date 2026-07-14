import type {StudyRoomId} from '../adapters/StudyAdapter'

export function applyStudyRoomResponse<T>(
  requestedRoomId: StudyRoomId,
  currentRoomId: () => StudyRoomId,
  value: T,
  apply: (value: T) => void,
): boolean {
  if (requestedRoomId !== currentRoomId()) return false
  apply(value)
  return true
}
