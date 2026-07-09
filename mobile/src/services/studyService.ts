import api from './api';
import type {GamificationPoints} from './gamificationService';

export type StudyLocationId = 'library' | 'chim-alan';
export type StudyInteraction = 'idle' | 'walking' | 'seated' | 'spark' | 'rock';
export type AvatarSlot = 'hair' | 'top' | 'bottom' | 'shoes' | 'accessory';
export type StudySessionType = 'study' | 'pomodoro';

export interface StudySession {
  id: string;
  location: StudyLocationId;
  status: 'active' | 'finished' | 'expired';
  session_type?: StudySessionType;
  pomodoro_target_minutes?: number | null;
  started_at?: string;
  last_heartbeat_at?: string;
  finished_at?: string | null;
}

export interface StartStudySessionPayload {
  location: StudyLocationId;
  clientSessionId: string;
  sessionType?: StudySessionType;
  pomodoroTargetMinutes?: 25 | 50 | number;
}

export interface StudyHeartbeatPayload {
  nonce: string;
  focused: boolean;
  foreground: boolean;
  position: {x: number; y: number};
  interaction: StudyInteraction;
  seatId?: string | null;
}

export interface FinishStudySessionPayload {
  nonce: string;
}

export interface StudySessionResponse {
  session: StudySession;
  nonce?: string;
  points?: GamificationPoints;
  awarded_points?: number;
}

export interface AvatarCatalogItem {
  itemId: string;
  slot: AvatarSlot;
  title: string;
  costPoints: number;
  rarity?: 'default' | 'common' | 'rare' | 'event';
  isDefault?: boolean;
  enabled?: boolean;
}

export interface AvatarProfile {
  ownedItemIds: string[];
  equipped: Partial<Record<AvatarSlot, string>>;
  points?: GamificationPoints;
}

export interface AvatarPurchaseResponse extends Partial<AvatarProfile> {
  points?: GamificationPoints;
}

export interface EquipAvatarItemPayload {
  slot: AvatarSlot;
  itemId: string;
}

export interface StudyRoomParticipant {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_style?: string | null;
  seat_id?: string | null;
  presence_mode?: 'studying' | 'break' | string;
  equipped_outfit?: Record<string, string | null> | null;
}

export interface StudyRoomState {
  room?: {
    id: string;
    title?: string;
    theme?: string;
    chat_enabled?: boolean;
  };
  zones: unknown[];
  seats: unknown[];
  participants: StudyRoomParticipant[];
}

export interface StudyRoomPresenceHeartbeatPayload {
  roomId: StudyLocationId;
  position: {x: number; y: number};
  seatId?: string | null;
  presenceMode?: 'studying' | 'break';
  avatarStyle?: string;
  equippedOutfit?: Record<string, string | null>;
  studiedSecondsDelta?: number;
}

export interface StudyRoomPresenceHeartbeatResponse {
  participant?: StudyRoomParticipant;
  studied_seconds_delta?: number;
}

function unwrapData<T>(response: {data?: {data?: T}}): T {
  return response.data?.data as T;
}

export async function startStudySession(payload: StartStudySessionPayload): Promise<StudySessionResponse> {
  const response = await api.post('/study/sessions/start', payload);
  return unwrapData<StudySessionResponse>(response);
}

export async function sendStudyHeartbeat(sessionId: string, payload: StudyHeartbeatPayload): Promise<StudySessionResponse> {
  const response = await api.post(`/study/sessions/${sessionId}/heartbeat`, mapStudyHeartbeatPayload(payload));
  return unwrapData<StudySessionResponse>(response);
}

export function mapStudyHeartbeatPayload(payload: StudyHeartbeatPayload) {
  const {seatId, ...rest} = payload;
  return {
    ...rest,
    ...(seatId ? {seat_id: seatId} : {}),
  };
}

export async function finishStudySession(sessionId: string, payload: FinishStudySessionPayload): Promise<StudySessionResponse> {
  const response = await api.post(`/study/sessions/${sessionId}/finish`, payload);
  return unwrapData<StudySessionResponse>(response);
}

export async function fetchAvatarCatalog(): Promise<AvatarCatalogItem[]> {
  const response = await api.get('/study/avatar/catalog');
  return unwrapData<{items?: AvatarCatalogItem[]}>(response).items ?? [];
}

export async function fetchAvatarProfile(): Promise<AvatarProfile> {
  const response = await api.get('/study/avatar/me');
  return unwrapData<AvatarProfile>(response);
}

export async function purchaseAvatarItem(itemId: string): Promise<AvatarPurchaseResponse> {
  const response = await api.post('/study/avatar/purchase', {itemId});
  return unwrapData<AvatarPurchaseResponse>(response);
}

export async function equipAvatarItem(payload: EquipAvatarItemPayload): Promise<Partial<AvatarProfile>> {
  const response = await api.post('/study/avatar/equip', payload);
  return unwrapData<Partial<AvatarProfile>>(response);
}

export async function fetchStudyRoomState(roomId: StudyLocationId = 'library'): Promise<StudyRoomState> {
  const response = await api.get(`/gamification/study-room?room_id=${encodeURIComponent(roomId)}`);
  const data = unwrapData<Partial<StudyRoomState>>(response);
  return {
    room: data.room,
    zones: data.zones ?? [],
    seats: data.seats ?? [],
    participants: data.participants ?? [],
  };
}

export async function sendStudyRoomPresenceHeartbeat(
  payload: StudyRoomPresenceHeartbeatPayload,
): Promise<StudyRoomPresenceHeartbeatResponse> {
  const response = await api.post('/gamification/study-room/heartbeat', {
    room_id: payload.roomId,
    position: payload.position,
    ...(payload.seatId ? {seat_id: payload.seatId} : {}),
    presence_mode: payload.presenceMode ?? 'studying',
    studied_seconds_delta: payload.studiedSecondsDelta ?? 0,
    ...(payload.avatarStyle ? {avatar_style: payload.avatarStyle} : {}),
    ...(payload.equippedOutfit ? {equipped_outfit: payload.equippedOutfit} : {}),
  });
  return unwrapData<StudyRoomPresenceHeartbeatResponse>(response);
}

export function isStudyRoomSeatConflictError(error: unknown): boolean {
  return (error as {response?: {status?: number}} | null)?.response?.status === 409;
}
