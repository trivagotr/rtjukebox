import {describe, expect, it} from '@jest/globals';

import {
  buildOccupiedStudySeatMarkers,
  buildStudySeatOccupancySnapshot,
  CHIM_ALAN_STUDY_MAP,
  LIBRARY_STUDY_MAP,
  findStudyPath,
  getStudyTileKind,
  getStudyTileTier,
  resolveStudySeatSlot,
  studyTileKey,
} from '../src/screens/study/studyMap';

describe('mobile Study map model', () => {
  it('defines the generated Library bitmap as a semantic A* walking map', () => {
    expect(LIBRARY_STUDY_MAP.id).toBe('library');
    expect(LIBRARY_STUDY_MAP.title).toBe('Library');
    expect(LIBRARY_STUDY_MAP.seats).toEqual([]);
    expect(getStudyTileKind(LIBRARY_STUDY_MAP, LIBRARY_STUDY_MAP.spawnTile)).toBe('walkable');
  });

  it('lets the Library marker walk to open floor with A* while avoiding table blockers', () => {
    const path = findStudyPath(LIBRARY_STUDY_MAP, LIBRARY_STUDY_MAP.spawnTile, {x: 20, y: 23});

    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({x: 20, y: 23});
    expect(getStudyTileKind(LIBRARY_STUDY_MAP, {x: 15, y: 12})).toBe('blocked');
    expect(findStudyPath(LIBRARY_STUDY_MAP, LIBRARY_STUDY_MAP.spawnTile, {x: 15, y: 12})).toEqual([]);
  });

  it('defines Çim alan as a block-style amphitheatre with stair connectors', () => {
    expect(CHIM_ALAN_STUDY_MAP.id).toBe('chim-alan');
    expect(CHIM_ALAN_STUDY_MAP.title).toBe('Çim alan');
    expect(CHIM_ALAN_STUDY_MAP.rows.length).toBeGreaterThanOrEqual(5);
    expect(CHIM_ALAN_STUDY_MAP.seats.length).toBeGreaterThanOrEqual(30);
    expect(CHIM_ALAN_STUDY_MAP.stairTiles.length).toBeGreaterThanOrEqual(12);
    expect(CHIM_ALAN_STUDY_MAP.riserTiles.length).toBeGreaterThanOrEqual(30);
    expect(CHIM_ALAN_STUDY_MAP.blockTiles.filter(block => block.kind === 'seat-row')).toHaveLength(CHIM_ALAN_STUDY_MAP.seats.length);
    expect(CHIM_ALAN_STUDY_MAP.blockTiles.filter(block => block.kind === 'stair')).toHaveLength(CHIM_ALAN_STUDY_MAP.stairTiles.length);
  });

  it('models campus blockers around the amphitheatre instead of only risers', () => {
    expect(CHIM_ALAN_STUDY_MAP.blockTiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({kind: 'building'}),
        expect.objectContaining({kind: 'pergola'}),
        expect.objectContaining({kind: 'bench'}),
        expect.objectContaining({kind: 'tree'}),
        expect.objectContaining({kind: 'planter'}),
        expect.objectContaining({kind: 'bollard'}),
      ]),
    );
  });

  it('keeps every Çim alan seat reachable by A* without crossing risers', () => {
    const risers = new Set(CHIM_ALAN_STUDY_MAP.riserTiles.map(studyTileKey));

    for (const seat of CHIM_ALAN_STUDY_MAP.seats) {
      const path = findStudyPath(CHIM_ALAN_STUDY_MAP, CHIM_ALAN_STUDY_MAP.spawnTile, seat.entryTile);
      if (path.length === 0) {
        throw new Error(`${seat.id} should be reachable`);
      }
      expect(path.some(tile => risers.has(studyTileKey(tile)))).toBe(false);
      expect(getStudyTileKind(CHIM_ALAN_STUDY_MAP, seat.tile)).toBe('seat');
      expect(getStudyTileKind(CHIM_ALAN_STUDY_MAP, seat.entryTile)).toBe('walkable');
    }
  });

  it('turns every Çim alan seat into a renderable seat slot with a fixed sitting pose', () => {
    for (const seat of CHIM_ALAN_STUDY_MAP.seats) {
      const slot = resolveStudySeatSlot(CHIM_ALAN_STUDY_MAP, seat.id);

      expect(slot).toEqual(
        expect.objectContaining({
          id: seat.id,
          tile: seat.tile,
          entryTile: seat.entryTile,
          posture: 'sitting',
        }),
      );
      expect(['sit-left', 'sit-right']).toContain(slot?.pose);
      expect(['west', 'east']).toContain(slot?.facing);
      expect(slot?.occlusionLayer).toBe('front-edge');
    }
  });

  it('exposes Spark and Rock as Çim alan map actors', () => {
    expect(CHIM_ALAN_STUDY_MAP.actors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'spark',
          name: 'Spark',
          subtitle: 'rtAI - AI Host',
          logoKind: 'ai-spark',
        }),
        expect.objectContaining({
          id: 'rock',
          name: 'Rock',
        }),
      ]),
    );
  });

  it('builds a backend-ready seat occupancy snapshot from room participants', () => {
    const snapshot = buildStudySeatOccupancySnapshot(CHIM_ALAN_STUDY_MAP, [
      {
        user_id: 'user-1',
        display_name: 'Ada',
        seat_id: 'chim-upper-seat-12',
        presence_mode: 'studying',
        avatar_style: 'classic-red',
        equipped_outfit: {top: 'spark-hoodie'},
      },
      {
        user_id: 'user-2',
        display_name: 'Break user',
        seat_id: 'chim-upper-seat-14',
        presence_mode: 'break',
      },
      {
        user_id: 'user-3',
        display_name: 'Invalid seat',
        seat_id: 'missing-seat',
        presence_mode: 'studying',
      },
    ]);

    expect(snapshot['chim-upper-seat-12']).toEqual(
      expect.objectContaining({
        seatId: 'chim-upper-seat-12',
        state: 'occupied',
        occupant: expect.objectContaining({
          userId: 'user-1',
          displayName: 'Ada',
          avatarStyle: 'classic-red',
          equippedOutfit: {top: 'spark-hoodie'},
        }),
      }),
    );
    expect(snapshot['chim-upper-seat-14']).toEqual(
      expect.objectContaining({
        seatId: 'chim-upper-seat-14',
        state: 'free',
        occupant: null,
      }),
    );
    expect(snapshot['chim-upper-seat-16']).toEqual(
      expect.objectContaining({
        seatId: 'chim-upper-seat-16',
        state: 'free',
        occupant: null,
      }),
    );
    expect(snapshot['missing-seat']).toBeUndefined();
  });

  it('turns occupied seats into stable render markers while excluding the local active seat', () => {
    const markers = buildOccupiedStudySeatMarkers(
      CHIM_ALAN_STUDY_MAP,
      [
        {
          user_id: 'user-1',
          display_name: 'Ada',
          seat_id: 'chim-upper-seat-12',
          presence_mode: 'studying',
          avatar_style: 'classic-red',
        },
        {
          user_id: 'user-2',
          display_name: 'Bora',
          seat_id: 'chim-upper-seat-14',
          presence_mode: 'studying',
          avatar_style: 'classic-blue',
        },
      ],
      'chim-upper-seat-14',
    );

    expect(markers).toEqual([
      expect.objectContaining({
        seatId: 'chim-upper-seat-12',
        label: 'Ada',
        leftPercent: expect.any(Number),
        topPercent: expect.any(Number),
        occupant: expect.objectContaining({userId: 'user-1'}),
      }),
    ]);
    expect(markers[0].leftPercent).toBeGreaterThan(0);
    expect(markers[0].leftPercent).toBeLessThan(100);
    expect(markers[0].topPercent).toBeGreaterThan(0);
    expect(markers[0].topPercent).toBeLessThan(100);
  });

  it('changes amphitheatre tiers only on stair connector blocks', () => {
    const stairKeys = new Set(CHIM_ALAN_STUDY_MAP.stairTiles.map(studyTileKey));
    const path = findStudyPath(CHIM_ALAN_STUDY_MAP, CHIM_ALAN_STUDY_MAP.spawnTile, {x: 13, y: 5});

    expect(path.length).toBeGreaterThan(0);
    for (let index = 1; index < path.length; index += 1) {
      const previous = path[index - 1];
      const current = path[index];
      if (getStudyTileTier(previous) === getStudyTileTier(current)) {
        continue;
      }

      expect(stairKeys.has(studyTileKey(previous)) || stairKeys.has(studyTileKey(current))).toBe(true);
    }
  });
});
