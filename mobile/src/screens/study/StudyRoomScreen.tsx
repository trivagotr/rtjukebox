import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Alert, ImageBackground, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import GlobalHeader from '../../components/GlobalHeader';
import PageTransition from '../../components/PageTransition';
import {useAuth} from '../../context/AuthContext';
import {COLORS, SPACING} from '../../theme/theme';
import {
  finishStudySession,
  fetchStudyRoomState,
  isStudyRoomSeatConflictError,
  sendStudyHeartbeat,
  sendStudyRoomPresenceHeartbeat,
  startStudySession,
  type StudyLocationId,
  type StudyInteraction,
  type StudyRoomParticipant,
  type StudySession,
  type StudySessionType,
} from '../../services/studyService';
import {
  buildOccupiedStudySeatMarkers,
  CHIM_ALAN_STUDY_MAP,
  LIBRARY_STUDY_MAP,
  findStudyPath,
  resolveStudySeatSlot,
  type StudyMapDefinition,
  type StudySeatSlot,
  type StudyTile,
} from './studyMap';
import SparkAiLogo from './SparkAiLogo';

const LOCATION_COPY: Record<StudyLocationId, {title: string; subtitle: string; icon: string}> = {
  library: {title: 'Library', subtitle: 'The existing indoor Study room will mount here.', icon: 'bookshelf'},
  'chim-alan': {title: 'Çim alan', subtitle: 'Block-style amphitheatre Study room with A* stairs, Spark, and Rock will mount here.', icon: 'stairs'},
};

const MAP_FRAME_WIDTH = 340;
const MAP_FRAME_HEIGHT = 430;
const libraryHabboImage = require('../../assets/study/library-habbo.png');
const POMODORO_PRESETS: Array<{minutes: 25 | 50; label: string}> = [
  {minutes: 25, label: '25 min'},
  {minutes: 50, label: '50 min'},
];

const StudyRoomScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const {user} = useAuth();
  const locationId = (route.params?.locationId ?? 'library') as StudyLocationId;
  const copy = LOCATION_COPY[locationId] ?? LOCATION_COPY.library;
  const [activeSession, setActiveSession] = useState<StudySession | null>(null);
  const [sessionNonce, setSessionNonce] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAward, setLastAward] = useState<number | null>(null);
  const [currentInteraction, setCurrentInteraction] = useState<StudyInteraction>('idle');
  const [currentSeatId, setCurrentSeatId] = useState<string | null>(null);
  const [seatConflictId, setSeatConflictId] = useState<string | null>(null);
  const [roomParticipants, setRoomParticipants] = useState<StudyRoomParticipant[]>([]);
  const [sessionMode, setSessionMode] = useState<StudySessionType>('study');
  const [pomodoroTargetMinutes, setPomodoroTargetMinutes] = useState<25 | 50 | 'custom'>(25);
  const [customPomodoroMinutes, setCustomPomodoroMinutes] = useState('25');
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clientSessionId = useMemo(() => `study-${locationId}-${Date.now().toString(36)}`, [locationId]);
  const isRegisteredUser = Boolean(user && !user.is_guest);
  const currentStudyRoomPosition = useMemo(() => {
    const seat = CHIM_ALAN_STUDY_MAP.seats.find(candidate => candidate.id === currentSeatId);
    return seat?.tile ?? CHIM_ALAN_STUDY_MAP.spawnTile;
  }, [currentSeatId]);
  const resolvedPomodoroTargetMinutes = useMemo(() => {
    if (pomodoroTargetMinutes !== 'custom') {
      return pomodoroTargetMinutes;
    }

    const parsed = Number.parseInt(customPomodoroMinutes, 10);
    if (!Number.isFinite(parsed)) {
      return 25;
    }
    return Math.max(5, Math.min(120, parsed));
  }, [customPomodoroMinutes, pomodoroTargetMinutes]);
  const isGuestPomodoroMode = sessionMode === 'pomodoro' && !isRegisteredUser;
  const isLocalPomodoroSession = Boolean(activeSession?.id.startsWith('local-pomodoro'));

  const refreshStudyRoomPresence = useCallback(async () => {
    if (locationId !== 'chim-alan') {
      setRoomParticipants([]);
      return;
    }

    try {
      const state = await fetchStudyRoomState(locationId);
      setRoomParticipants(state.participants);
    } catch (error) {
      setRoomParticipants([]);
    }
  }, [locationId]);

  const publishStudyRoomPresence = useCallback(async () => {
    if (locationId !== 'chim-alan') {
      return;
    }

    try {
      await sendStudyRoomPresenceHeartbeat({
        roomId: locationId,
        position: currentStudyRoomPosition,
        seatId: currentSeatId,
        presenceMode: 'studying',
        studiedSecondsDelta: 0,
      });
      refreshStudyRoomPresence();
    } catch (error) {
      if (currentSeatId && isStudyRoomSeatConflictError(error)) {
        setSeatConflictId(currentSeatId);
        setCurrentSeatId(null);
        Alert.alert('Seat unavailable', 'That seat was just taken. Pick another seat.');
        refreshStudyRoomPresence();
      }
      throw error;
    }
  }, [currentSeatId, currentStudyRoomPosition, locationId, refreshStudyRoomPresence]);

  useEffect(() => {
    refreshStudyRoomPresence();
    if (locationId !== 'chim-alan') {
      return undefined;
    }

    presenceTimer.current = setInterval(refreshStudyRoomPresence, 30_000);
    return () => {
      if (presenceTimer.current) {
        clearInterval(presenceTimer.current);
        presenceTimer.current = null;
      }
    };
  }, [locationId, refreshStudyRoomPresence]);

  useEffect(() => {
    if (!activeSession || !sessionNonce) {
      return undefined;
    }

    heartbeatTimer.current = setInterval(async () => {
      try {
        const response = await sendStudyHeartbeat(activeSession.id, {
          nonce: sessionNonce,
          focused: true,
          foreground: true,
          position: locationId === 'chim-alan' ? {x: 13, y: 18} : {x: 5, y: 5},
          interaction: currentInteraction,
          seatId: currentSeatId,
        });
        setSessionNonce(response.nonce ?? null);
        await publishStudyRoomPresence().catch(() => undefined);
        refreshStudyRoomPresence();
      } catch (error) {
        if (heartbeatTimer.current) {
          clearInterval(heartbeatTimer.current);
          heartbeatTimer.current = null;
        }
      }
    }, 60_000);

    return () => {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
    };
  }, [activeSession, currentInteraction, currentSeatId, locationId, publishStudyRoomPresence, refreshStudyRoomPresence, sessionNonce]);

  useEffect(() => {
    if (!activeSession || isLocalPomodoroSession || locationId !== 'chim-alan') {
      return;
    }

    publishStudyRoomPresence().catch(() => undefined);
  }, [activeSession, currentSeatId, isLocalPomodoroSession, locationId, publishStudyRoomPresence]);

  const handleSessionPress = async () => {
    setBusy(true);
    try {
      if (!activeSession) {
        if (isGuestPomodoroMode) {
          setActiveSession({
            id: `local-pomodoro-${clientSessionId}`,
            location: locationId,
            status: 'active',
            session_type: 'pomodoro',
            pomodoro_target_minutes: resolvedPomodoroTargetMinutes,
          });
          setSessionNonce(null);
          setLastAward(null);
          return;
        }

        const response = await startStudySession({
          location: locationId,
          clientSessionId,
          ...(sessionMode === 'pomodoro'
            ? {
                sessionType: 'pomodoro',
                pomodoroTargetMinutes: resolvedPomodoroTargetMinutes,
              }
            : {sessionType: 'study'}),
        });
        setActiveSession(response.session);
        setSessionNonce(response.nonce ?? null);
        setLastAward(null);
        return;
      }

      if (isLocalPomodoroSession) {
        setActiveSession(null);
        setSessionNonce(null);
        setLastAward(null);
        return;
      }

      if (!sessionNonce) {
        Alert.alert('Study session', 'Session nonce is missing. Please restart Study.');
        return;
      }

      const response = await finishStudySession(activeSession.id, {nonce: sessionNonce});
      setActiveSession(null);
      setSessionNonce(null);
      setLastAward(response.awarded_points ?? 0);
    } catch (error) {
      Alert.alert('Study session', 'Study session could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageTransition>
      <SafeAreaView style={styles.container}>
        <GlobalHeader />
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.iconBox}>
              <Icon name={copy.icon} size={30} color={COLORS.primary} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{copy.title}</Text>
              <Text style={styles.subtitle}>{copy.subtitle}</Text>
            </View>
          </View>
          {locationId === 'chim-alan' ? (
            <StudyMapPreview
              map={CHIM_ALAN_STUDY_MAP}
              participants={roomParticipants}
              rejectedSeatId={seatConflictId}
              onInteractionChange={setCurrentInteraction}
              onSeatChange={setCurrentSeatId}
            />
          ) : <LibraryPreview />}
          <View style={styles.sessionModePanel}>
            <View style={styles.segmentedRow}>
              <TouchableOpacity
                style={[styles.segmentButton, sessionMode === 'study' ? styles.segmentButtonActive : null]}
                disabled={!!activeSession}
                onPress={() => setSessionMode('study')}>
                <Icon name="book-open-page-variant" size={16} color={sessionMode === 'study' ? '#fff' : COLORS.text} />
                <Text style={[styles.segmentButtonText, sessionMode === 'study' ? styles.segmentButtonTextActive : null]}>Study</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, sessionMode === 'pomodoro' ? styles.segmentButtonActive : null]}
                disabled={!!activeSession}
                onPress={() => setSessionMode('pomodoro')}>
                <Icon name="timer-outline" size={16} color={sessionMode === 'pomodoro' ? '#fff' : COLORS.text} />
                <Text style={[styles.segmentButtonText, sessionMode === 'pomodoro' ? styles.segmentButtonTextActive : null]}>Pomodoro</Text>
              </TouchableOpacity>
            </View>
            {sessionMode === 'pomodoro' ? (
              <View style={styles.pomodoroRow}>
                {POMODORO_PRESETS.map(preset => (
                  <TouchableOpacity
                    key={preset.minutes}
                    style={[styles.durationButton, pomodoroTargetMinutes === preset.minutes ? styles.durationButtonActive : null]}
                    disabled={!!activeSession}
                    onPress={() => setPomodoroTargetMinutes(preset.minutes)}>
                    <Text style={[styles.durationButtonText, pomodoroTargetMinutes === preset.minutes ? styles.durationButtonTextActive : null]}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.durationButton, pomodoroTargetMinutes === 'custom' ? styles.durationButtonActive : null]}
                  disabled={!!activeSession}
                  onPress={() => setPomodoroTargetMinutes('custom')}>
                  <Text style={[styles.durationButtonText, pomodoroTargetMinutes === 'custom' ? styles.durationButtonTextActive : null]}>Custom</Text>
                </TouchableOpacity>
                {pomodoroTargetMinutes === 'custom' ? (
                  <TextInput
                    style={styles.customDurationInput}
                    value={customPomodoroMinutes}
                    editable={!activeSession}
                    keyboardType="number-pad"
                    maxLength={3}
                    onChangeText={setCustomPomodoroMinutes}
                  />
                ) : null}
              </View>
            ) : null}
            {isGuestPomodoroMode ? (
              <View style={styles.leaderboardNotice}>
                <Icon name="trophy-off-outline" size={16} color={COLORS.primary} />
                <Text style={styles.leaderboardNoticeText}>
                  Pomodoro works without an account, but this session will not appear on the leaderboard.
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.sessionButton} onPress={handleSessionPress} disabled={busy}>
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Icon name={activeSession ? 'stop-circle' : 'play-circle'} size={20} color="#fff" />
              )}
              <Text style={styles.sessionButtonText}>{activeSession ? 'Finish session' : 'Start session'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closetButton} onPress={() => navigation.navigate('AvatarCloset')}>
              <Icon name="hanger" size={20} color={COLORS.primary} />
              <Text style={styles.closetButtonText}>Closet</Text>
            </TouchableOpacity>
          </View>
          {lastAward !== null ? <Text style={styles.awardText}>+{lastAward} global points</Text> : null}
        </View>
      </SafeAreaView>
    </PageTransition>
  );
};

function StudyMapPreview({
  map,
  participants,
  rejectedSeatId,
  onInteractionChange,
  onSeatChange,
}: {
  map: StudyMapDefinition;
  participants: StudyRoomParticipant[];
  rejectedSeatId: string | null;
  onInteractionChange: (interaction: StudyInteraction) => void;
  onSeatChange: (seatId: string | null) => void;
}) {
  const [avatarTile, setAvatarTile] = useState<StudyTile>(map.spawnTile);
  const [walkingPath, setWalkingPath] = useState<StudyTile[]>([]);
  const [avatarPosture, setAvatarPosture] = useState<'standing' | 'walking' | 'sitting'>('standing');
  const [activeSeatSlot, setActiveSeatSlot] = useState<StudySeatSlot | null>(null);
  const [pendingSeatSlot, setPendingSeatSlot] = useState<StudySeatSlot | null>(null);
  const visibleSeats = map.seats.filter((_, index) => index % 2 === 0);
  const visibleBlocks = map.blockTiles.filter(block =>
    ['seat-row', 'stair', 'riser', 'stage', 'building', 'pergola', 'bench', 'tree', 'planter', 'bollard', 'rock'].includes(block.kind),
  );
  const occupiedSeatMarkers = useMemo(
    () => buildOccupiedStudySeatMarkers(map, participants, activeSeatSlot?.id),
    [activeSeatSlot?.id, map, participants],
  );

  useEffect(() => {
    if (!rejectedSeatId || activeSeatSlot?.id !== rejectedSeatId) {
      return;
    }

    setActiveSeatSlot(null);
    setPendingSeatSlot(null);
    setWalkingPath([]);
    setAvatarPosture('standing');
    setAvatarTile(activeSeatSlot.entryTile);
    onInteractionChange('idle');
    onSeatChange(null);
  }, [activeSeatSlot, onInteractionChange, onSeatChange, rejectedSeatId]);

  useEffect(() => {
    if (walkingPath.length === 0) {
      onInteractionChange(activeSeatSlot ? 'seated' : 'idle');
      return undefined;
    }

    onInteractionChange('walking');
    setAvatarPosture('walking');
    const [nextTile, ...remainingPath] = walkingPath;
    const timer = setTimeout(() => {
      if (remainingPath.length === 0 && pendingSeatSlot) {
        setAvatarTile(pendingSeatSlot.tile);
        setActiveSeatSlot(pendingSeatSlot);
        setPendingSeatSlot(null);
        setAvatarPosture('sitting');
        onInteractionChange('seated');
        onSeatChange(pendingSeatSlot.id);
      } else {
        setAvatarTile(nextTile);
      }
      setWalkingPath(remainingPath);
      if (remainingPath.length === 0 && !pendingSeatSlot) {
        setAvatarPosture('standing');
        onInteractionChange('idle');
        onSeatChange(null);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [activeSeatSlot, onInteractionChange, onSeatChange, pendingSeatSlot, walkingPath]);

  const handleMapPress = (event: {nativeEvent: {locationX: number; locationY: number}}) => {
    const target: StudyTile = {
      x: Math.max(1, Math.min(map.width - 2, Math.round((event.nativeEvent.locationX / MAP_FRAME_WIDTH) * map.width))),
      y: Math.max(1, Math.min(map.height - 2, Math.round((event.nativeEvent.locationY / MAP_FRAME_HEIGHT) * map.height))),
    };
    const path = findStudyPath(map, avatarTile, target);
    if (path.length > 0) {
      setActiveSeatSlot(null);
      setPendingSeatSlot(null);
      setAvatarPosture('walking');
      setWalkingPath(path);
      onSeatChange(null);
    }
  };

  const handleSeatPress = (seatId: string) => {
    if (occupiedSeatMarkers.some(marker => marker.seatId === seatId)) {
      return;
    }

    const slot = resolveStudySeatSlot(map, seatId);
    if (!slot || slot.occlusionLayer !== 'front-edge') {
      return;
    }

    const path = findStudyPath(map, avatarTile, slot.entryTile);
    if (path.length === 0 && (avatarTile.x !== slot.entryTile.x || avatarTile.y !== slot.entryTile.y)) {
      return;
    }

    setActiveSeatSlot(null);
    setPendingSeatSlot(slot);
    if (path.length === 0) {
      setAvatarTile(slot.tile);
      setPendingSeatSlot(null);
      setActiveSeatSlot(slot);
      setAvatarPosture('sitting');
      onInteractionChange('seated');
      onSeatChange(slot.id);
      return;
    }

    setAvatarPosture('walking');
    setWalkingPath(path);
  };

  return (
    <Pressable style={styles.mapFrame} onPress={handleMapPress}>
      <View style={styles.blockLayer} pointerEvents="none">
        {visibleBlocks.map(block => (
          <View
            key={`block-${block.tile.x}-${block.tile.y}`}
            style={[
              styles.amphiBlock,
              block.kind === 'stair' ? styles.stairBlock : null,
              block.kind === 'riser' ? styles.riserBlock : null,
              block.kind === 'seat-row' ? styles.seatRowBlock : null,
              block.kind === 'stage' ? styles.stageBlock : null,
              block.kind === 'building' ? styles.buildingBlock : null,
              block.kind === 'pergola' ? styles.pergolaBlock : null,
              block.kind === 'bench' ? styles.benchBlock : null,
              block.kind === 'tree' ? styles.treeBlock : null,
              block.kind === 'planter' ? styles.planterBlock : null,
              block.kind === 'bollard' ? styles.bollardBlock : null,
              block.kind === 'rock' ? styles.rockBlock : null,
              {
                left: `${(block.tile.x / map.width) * 100}%`,
                top: `${(block.tile.y / map.height) * 100}%`,
                opacity: 0.34 + block.tier * 0.06,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.stage}>
        <Text style={styles.stageText}>Çim alan stage</Text>
      </View>
      {map.rows.map((row, index) => (
        <View
          key={row.id}
          style={[
            styles.amphiRow,
            {
              width: `${58 + index * 8}%`,
              opacity: 0.74 + index * 0.05,
            },
            index === 0 ? styles.amphiRowFirst : styles.amphiRowStacked,
          ]}>
          <Text style={styles.rowLabel}>{row.label}</Text>
        </View>
      ))}
      <View style={[styles.stairColumn, styles.stairColumnLeft]}>
        {map.stairTiles.slice(0, 4).map(tile => (
          <View key={`left-${tile.x}-${tile.y}`} style={styles.stairStep} />
        ))}
      </View>
      <View style={[styles.stairColumn, styles.stairColumnRight]}>
        {map.stairTiles.slice(4, 8).map(tile => (
          <View key={`right-${tile.x}-${tile.y}`} style={styles.stairStep} />
        ))}
      </View>
      <View style={styles.seatCloud}>
        {visibleSeats.slice(0, 30).map(seat => (
          <Pressable key={seat.id} onPress={() => handleSeatPress(seat.id)} style={styles.seatDot} />
        ))}
      </View>
      {occupiedSeatMarkers.map(marker => (
        <View
          key={`occupied-${marker.seatId}`}
          style={[
            styles.occupiedSeatMarker,
            {
              left: `${marker.leftPercent}%`,
              top: `${marker.topPercent}%`,
            },
          ]}>
          <Text style={styles.occupiedSeatInitial}>{marker.label.slice(0, 1).toUpperCase()}</Text>
          <Text numberOfLines={1} style={styles.occupiedSeatLabel}>{marker.label}</Text>
        </View>
      ))}
      {map.actors.map(actor => (
        <View key={actor.id} style={[styles.actorBadge, actor.id === 'spark' ? styles.sparkBadge : styles.rockBadge]}>
          {actor.id === 'spark' ? (
            <SparkAiLogo size={24} />
          ) : (
            <Icon name="circle-slice-8" size={16} color={COLORS.text} />
          )}
          <View>
            <Text style={styles.actorTitle}>{actor.name}</Text>
            {actor.subtitle ? <Text style={styles.actorSubtitle}>{actor.subtitle}</Text> : null}
          </View>
        </View>
      ))}
      <View
        style={[
          styles.walkingAvatar,
          avatarPosture === 'sitting' ? styles.seatedAvatar : null,
          activeSeatSlot?.pose === 'sit-left' ? styles.seatedAvatarLeft : null,
          activeSeatSlot?.pose === 'sit-right' ? styles.seatedAvatarRight : null,
          {
            left: `${(avatarTile.x / map.width) * 100}%`,
            top: `${(avatarTile.y / map.height) * 100}%`,
          },
        ]}>
        <Text style={styles.localUserInitial}>Y</Text>
        <Text style={styles.localUserLabel}>You</Text>
      </View>
    </Pressable>
  );
}

function LibraryPreview() {
  const [libraryAvatarTile, setLibraryAvatarTile] = useState<StudyTile>(LIBRARY_STUDY_MAP.spawnTile);
  const [libraryWalkingPath, setLibraryWalkingPath] = useState<StudyTile[]>([]);

  useEffect(() => {
    if (libraryWalkingPath.length === 0) {
      return undefined;
    }

    const [nextTile, ...remainingPath] = libraryWalkingPath;
    const timer = setTimeout(() => {
      setLibraryAvatarTile(nextTile);
      setLibraryWalkingPath(remainingPath);
    }, 160);

    return () => clearTimeout(timer);
  }, [libraryWalkingPath]);

  const handleLibraryPress = (event: {nativeEvent: {locationX: number; locationY: number}}) => {
    const target: StudyTile = {
      x: Math.max(1, Math.min(LIBRARY_STUDY_MAP.width - 2, Math.round((event.nativeEvent.locationX / MAP_FRAME_WIDTH) * LIBRARY_STUDY_MAP.width))),
      y: Math.max(1, Math.min(LIBRARY_STUDY_MAP.height - 2, Math.round((event.nativeEvent.locationY / MAP_FRAME_HEIGHT) * LIBRARY_STUDY_MAP.height))),
    };
    const path = findStudyPath(LIBRARY_STUDY_MAP, libraryAvatarTile, target);
    if (path.length > 0) {
      setLibraryWalkingPath(path);
    }
  };

  return (
    <Pressable style={styles.libraryFrame} onPress={handleLibraryPress}>
      <ImageBackground source={libraryHabboImage} style={styles.libraryImage} imageStyle={styles.libraryImageStyle} resizeMode="cover">
        <View
          style={[
            styles.walkingAvatar,
            styles.libraryLocalMarker,
            {
              left: `${(libraryAvatarTile.x / LIBRARY_STUDY_MAP.width) * 100}%`,
              top: `${(libraryAvatarTile.y / LIBRARY_STUDY_MAP.height) * 100}%`,
            },
          ]}>
          <Text style={styles.localUserInitial}>Y</Text>
          <Text style={styles.localUserLabel}>You</Text>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  content: {flex: 1, padding: SPACING.lg},
  headerRow: {flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg},
  headerCopy: {flex: 1},
  iconBox: {width: 58, height: 58, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(227,30,36,0.12)'},
  title: {color: COLORS.text, fontSize: 28, fontWeight: '900'},
  subtitle: {color: COLORS.textMuted, fontSize: 14, lineHeight: 20, marginTop: 4},
  mapFrame: {height: 430, overflow: 'hidden', borderRadius: 8, backgroundColor: '#17351f', borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', paddingTop: SPACING.md},
  libraryFrame: {height: 430, overflow: 'hidden', borderRadius: 8, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border},
  libraryImage: {flex: 1},
  libraryImageStyle: {borderRadius: 8},
  libraryLocalMarker: {zIndex: 2},
  blockLayer: {position: 'absolute', left: 10, right: 10, top: 12, bottom: 18},
  amphiBlock: {position: 'absolute', width: 13, height: 9, borderRadius: 2, backgroundColor: '#2e7a42', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', transform: [{skewX: '-18deg'}]},
  stairBlock: {backgroundColor: '#b7a57a', borderColor: '#6c5a3b'},
  riserBlock: {height: 5, backgroundColor: '#4a392d', borderColor: 'rgba(0,0,0,0.24)'},
  seatRowBlock: {backgroundColor: '#d6c16d', borderColor: '#7a6624'},
  stageBlock: {backgroundColor: '#2b2630', borderColor: 'rgba(255,255,255,0.16)'},
  buildingBlock: {width: 18, height: 12, backgroundColor: '#c8d0d2', borderColor: '#6f7d82'},
  pergolaBlock: {width: 16, height: 12, backgroundColor: '#8a542d', borderColor: '#3c2416'},
  benchBlock: {width: 20, height: 7, backgroundColor: '#8b5a2b', borderColor: '#38200f'},
  treeBlock: {width: 16, height: 16, borderRadius: 8, backgroundColor: '#1f6c31', borderColor: '#0d3517'},
  planterBlock: {width: 18, height: 10, backgroundColor: '#42684a', borderColor: '#1e3323'},
  bollardBlock: {width: 8, height: 8, borderRadius: 4, backgroundColor: '#d5dde0', borderColor: '#4d5b60'},
  rockBlock: {width: 16, height: 13, backgroundColor: '#5c6166', borderColor: '#2c3034'},
  stage: {minWidth: 142, minHeight: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2b2630', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)'},
  stageText: {color: COLORS.text, fontSize: 12, fontWeight: '900'},
  amphiRow: {height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#276b38', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', transform: [{skewX: '-12deg'}]},
  amphiRowFirst: {marginTop: 18},
  amphiRowStacked: {marginTop: 10},
  rowLabel: {color: 'rgba(255,255,255,0.82)', fontSize: 10, fontWeight: '800'},
  stairColumn: {position: 'absolute', top: 86, gap: 18},
  stairColumnLeft: {left: 56},
  stairColumnRight: {right: 56},
  stairStep: {width: 28, height: 11, borderRadius: 3, backgroundColor: '#b7a57a', borderWidth: 1, borderColor: '#6c5a3b'},
  seatCloud: {position: 'absolute', left: 54, right: 54, bottom: 52, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 9},
  seatDot: {width: 14, height: 10, borderRadius: 3, backgroundColor: '#d6c16d', borderWidth: 1, borderColor: '#7a6624'},
  occupiedSeatMarker: {position: 'absolute', width: 54, height: 34, marginLeft: -27, marginTop: -26, alignItems: 'center', justifyContent: 'center'},
  occupiedSeatInitial: {width: 22, height: 22, borderRadius: 11, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', backgroundColor: '#d6c16d', borderWidth: 2, borderColor: '#fff', color: COLORS.text, fontSize: 11, fontWeight: '900'},
  occupiedSeatLabel: {maxWidth: 54, marginTop: 2, paddingHorizontal: 4, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.46)', color: '#fff', fontSize: 8, fontWeight: '800'},
  actorBadge: {position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: SPACING.sm, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)'},
  sparkBadge: {top: 54, right: 38, backgroundColor: '#6337b5'},
  rockBadge: {top: 130, right: 26, backgroundColor: '#4c4d50'},
  actorTitle: {color: COLORS.text, fontSize: 12, fontWeight: '900'},
  actorSubtitle: {color: 'rgba(255,255,255,0.72)', fontSize: 10},
  walkingAvatar: {position: 'absolute', width: 46, height: 58, marginLeft: -23, marginTop: -38, alignItems: 'center', justifyContent: 'flex-start'},
  seatedAvatar: {marginTop: -40},
  seatedAvatarLeft: {transform: []},
  seatedAvatarRight: {transform: []},
  localUserInitial: {width: 42, height: 42, borderRadius: 21, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', backgroundColor: '#168f96', borderWidth: 4, borderColor: '#fff', color: '#fff', fontSize: 16, fontWeight: '900'},
  localUserLabel: {minWidth: 34, height: 20, marginTop: -2, paddingHorizontal: 7, borderRadius: 4, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', backgroundColor: '#222326', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 11, fontWeight: '900'},
  sessionModePanel: {marginTop: SPACING.md, gap: SPACING.sm},
  segmentedRow: {flexDirection: 'row', gap: SPACING.sm},
  segmentButton: {flex: 1, minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs},
  segmentButtonActive: {backgroundColor: COLORS.primary, borderColor: COLORS.primary},
  segmentButtonText: {color: COLORS.text, fontSize: 13, fontWeight: '900'},
  segmentButtonTextActive: {color: '#fff'},
  pomodoroRow: {flexDirection: 'row', alignItems: 'center', gap: SPACING.xs},
  durationButton: {minWidth: 58, height: 38, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.sm},
  durationButtonActive: {backgroundColor: 'rgba(227,30,36,0.14)', borderColor: COLORS.primary},
  durationButtonText: {color: COLORS.text, fontSize: 12, fontWeight: '900'},
  durationButtonTextActive: {color: COLORS.primary},
  customDurationInput: {width: 58, height: 38, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, color: COLORS.text, textAlign: 'center', fontSize: 13, fontWeight: '900', paddingVertical: 0},
  leaderboardNotice: {flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(227,30,36,0.28)', backgroundColor: 'rgba(227,30,36,0.08)', padding: SPACING.sm},
  leaderboardNoticeText: {flex: 1, color: COLORS.textMuted, fontSize: 12, lineHeight: 17, fontWeight: '700'},
  actionRow: {flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md},
  sessionButton: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, minHeight: 48, borderRadius: 8, backgroundColor: COLORS.primary},
  sessionButtonText: {color: '#fff', fontSize: 14, fontWeight: '900'},
  closetButton: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, minHeight: 48, borderRadius: 8, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border},
  closetButtonText: {color: COLORS.text, fontSize: 14, fontWeight: '900'},
  awardText: {color: COLORS.success, fontSize: 13, fontWeight: '900', marginTop: SPACING.sm},
});

export default StudyRoomScreen;
