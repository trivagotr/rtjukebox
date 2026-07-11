export interface CameraSize {
  width: number
  height: number
}

export function calculateOverviewZoom(viewport: CameraSize, room: CameraSize): number {
  if (viewport.width <= 0 || viewport.height <= 0 || room.width <= 0 || room.height <= 0) return 1
  return Math.min(viewport.width / room.width, viewport.height / room.height)
}
