export type SocialRoomId = 'welcome' | 'chim-alan' | 'grass-amphitheatre' | 'library';
export type SeatStrategy = 'seat-slots' | 'standing-first';

export type SocialRoomDefinition = {
  id: SocialRoomId;
  title: string;
  kind: 'spawn-lobby' | 'outdoor-quad' | 'outdoor-amphi' | 'indoor-study';
  seatStrategy: SeatStrategy;
  references: string[];
};

export const SOCIAL_ROOMS: SocialRoomDefinition[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    kind: 'spawn-lobby',
    seatStrategy: 'standing-first',
    references: [
      'tedu-360-rotated-refs/01-welcome-center.png',
      'tedu-360-rotated-refs/01-welcome-look-right.png',
      'tedu-360-rotated-refs/01-welcome-look-left.png',
      'tedu-360-rotated-refs/01-welcome-look-back.png',
    ],
  },
  {
    id: 'chim-alan',
    title: 'Cim alan',
    kind: 'outdoor-quad',
    seatStrategy: 'seat-slots',
    references: [
      'tedu-360-rotated-refs/03-social-areas-quad-center.png',
      'tedu-360-rotated-refs/03-social-areas-quad-look-right.png',
      'tedu-360-rotated-refs/03-social-areas-quad-look-left.png',
      'tedu-360-rotated-refs/03-social-areas-quad-look-back.png',
    ],
  },
  {
    id: 'grass-amphitheatre',
    title: 'Grass Amphitheatre',
    kind: 'outdoor-amphi',
    seatStrategy: 'seat-slots',
    references: [
      'tedu-360-rotated-refs/04-social-areas-grass-amphitheatre-center.png',
      'tedu-360-rotated-refs/04-social-areas-grass-amphitheatre-look-right.png',
      'tedu-360-rotated-refs/04-social-areas-grass-amphitheatre-look-left.png',
      'tedu-360-rotated-refs/04-social-areas-grass-amphitheatre-look-back.png',
    ],
  },
  {
    id: 'library',
    title: 'Library',
    kind: 'indoor-study',
    seatStrategy: 'seat-slots',
    references: [
      'tedu-360-rotated-refs/06-libraries-block-a-library-center.png',
      'tedu-360-rotated-refs/06-libraries-block-a-library-look-right.png',
      'tedu-360-rotated-refs/06-libraries-block-a-library-look-left.png',
      'tedu-360-rotated-refs/06-libraries-block-a-library-look-back.png',
    ],
  },
];

export function getSocialRoom(id: SocialRoomId): SocialRoomDefinition {
  const room = SOCIAL_ROOMS.find(candidate => candidate.id === id);
  if (!room) {
    throw new Error(`Unknown social room: ${id}`);
  }
  return room;
}
