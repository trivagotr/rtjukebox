import api from './api';

export interface GamificationPoints {
  lifetime_points: number;
  spendable_points: number;
  monthly_points?: number;
  listening_points?: number;
  events_points?: number;
  games_points?: number;
  social_points?: number;
  jukebox_points?: number;
}

export interface MarketItem {
  id: string;
  title: string;
  description?: string | null;
  item_kind?: 'digital' | 'physical' | 'coupon' | 'badge';
  cost_points: number;
  image_url?: string | null;
  stock_quantity?: number | null;
}

export interface AppEvent {
  id: string;
  title: string;
  description?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  location?: string | null;
  image_url?: string | null;
  check_in_points?: number;
}

export interface ArcadeGame {
  id: string;
  slug?: string;
  title: string;
  description?: string | null;
  point_rate?: number | string;
  daily_point_limit?: number;
  metadata?: Record<string, unknown>;
}

export interface GamificationHome {
  points: GamificationPoints;
  events: AppEvent[];
  games: ArcadeGame[];
  market: MarketItem[];
}

export interface ListeningHeartbeatPayload {
  content_type: 'radio' | 'podcast' | string;
  content_id?: string;
  content_title?: string;
  listened_seconds: number;
}

function unwrapData<T>(response: {data?: {data?: T}}): T {
  return response.data?.data as T;
}

export async function fetchGamificationMe() {
  const response = await api.get('/gamification/me');
  return unwrapData(response);
}

export async function fetchGamificationHome(): Promise<GamificationHome> {
  const response = await api.get('/gamification/home');
  return unwrapData<GamificationHome>(response);
}

export async function fetchEvents(): Promise<AppEvent[]> {
  const response = await api.get('/gamification/events');
  return unwrapData<{events?: AppEvent[]}>(response).events ?? [];
}

export async function fetchMyTickets() {
  const response = await api.get('/gamification/events/my-tickets');
  return unwrapData<{tickets?: unknown[]}>(response).tickets ?? [];
}

export async function registerEvent(eventId: string) {
  const response = await api.post(`/gamification/events/${eventId}/register`);
  return unwrapData(response);
}

export async function claimQrReward(code: string) {
  const response = await api.post('/gamification/events/qr/claim', {code});
  return unwrapData(response);
}

export async function fetchGames(): Promise<ArcadeGame[]> {
  const response = await api.get('/gamification/games');
  return unwrapData<{games?: ArcadeGame[]}>(response).games ?? [];
}

export async function submitGameScore(gameId: string, score: number) {
  const response = await api.post(`/gamification/games/${gameId}/score`, {score});
  return unwrapData(response);
}

export async function fetchMarketItems(): Promise<MarketItem[]> {
  const response = await api.get('/gamification/market');
  return unwrapData<{items?: MarketItem[]}>(response).items ?? [];
}

export async function redeemMarketItem(itemId: string) {
  const response = await api.post(`/gamification/market/${itemId}/redeem`);
  return unwrapData(response);
}

export async function sendListeningHeartbeat(payload: ListeningHeartbeatPayload) {
  const response = await api.post('/gamification/listening/heartbeat', payload);
  return unwrapData(response);
}
