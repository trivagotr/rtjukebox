import type { StudyRoomInstance } from '../adapters/StudyAdapter'

export function formatRoomInstanceLabel(instance: StudyRoomInstance | null): string {
  if (!instance) return 'Finding room…'
  return `Room ${instance.number} · ${instance.occupancy}/${instance.capacity}`
}
