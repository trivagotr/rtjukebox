import { Server, Socket } from 'socket.io';

export type SocialRoomId = 'welcome' | 'chim-alan' | 'grass-amphitheatre' | 'library';

export type SocialRoomParticipant = {
    userId: string;
    socketId: string;
    seatId: string | null;
};

export type SocialRoomState = {
    roomId: SocialRoomId;
    participants: SocialRoomParticipant[];
};

type SocialRoomStore = {
    join(roomId: SocialRoomId, socketId: string, userId: string): SocialRoomState;
    leave(roomId: SocialRoomId, userId: string): SocialRoomState;
    leaveBySocket(socketId: string): SocialRoomState[];
    sit(roomId: SocialRoomId, userId: string, seatId: string): SocialRoomState;
    getState(roomId: SocialRoomId): SocialRoomState;
};

const roomSocketName = (roomId: SocialRoomId) => `social:${roomId}`;

export function createSocialRoomPresenceStore(): SocialRoomStore {
    const rooms = new Map<SocialRoomId, Map<string, SocialRoomParticipant>>();

    const ensureRoom = (roomId: SocialRoomId) => {
        const existing = rooms.get(roomId);
        if (existing) return existing;

        const created = new Map<string, SocialRoomParticipant>();
        rooms.set(roomId, created);
        return created;
    };

    const getState = (roomId: SocialRoomId): SocialRoomState => ({
        roomId,
        participants: Array.from(rooms.get(roomId)?.values() ?? []),
    });

    return {
        join(roomId, socketId, userId) {
            ensureRoom(roomId).set(userId, { userId, socketId, seatId: null });
            return getState(roomId);
        },
        leave(roomId, userId) {
            rooms.get(roomId)?.delete(userId);
            return getState(roomId);
        },
        leaveBySocket(socketId) {
            const changedStates: SocialRoomState[] = [];

            for (const [roomId, participants] of rooms.entries()) {
                let changed = false;

                for (const participant of participants.values()) {
                    if (participant.socketId === socketId) {
                        participants.delete(participant.userId);
                        changed = true;
                    }
                }

                if (changed) {
                    changedStates.push(getState(roomId));
                }
            }

            return changedStates;
        },
        sit(roomId, userId, seatId) {
            const room = ensureRoom(roomId);
            const current = room.get(userId);
            room.set(userId, {
                userId,
                socketId: current?.socketId ?? '',
                seatId,
            });

            return getState(roomId);
        },
        getState,
    };
}

const defaultSocialRoomStore = createSocialRoomPresenceStore();

function isSocialRoomId(value: unknown): value is SocialRoomId {
    return (
        value === 'welcome' ||
        value === 'chim-alan' ||
        value === 'grass-amphitheatre' ||
        value === 'library'
    );
}

export function registerSocialRoomSocketHandlers(
    io: Server,
    socket: Socket,
    store: SocialRoomStore = defaultSocialRoomStore,
) {
    socket.on('room:join', (data: { roomId?: unknown; userId?: unknown }) => {
        if (!isSocialRoomId(data?.roomId) || typeof data.userId !== 'string') return;

        const roomName = roomSocketName(data.roomId);
        socket.join(roomName);
        io.to(roomName).emit('room:state', store.join(data.roomId, socket.id, data.userId));
    });

    socket.on('room:sit', (data: { roomId?: unknown; userId?: unknown; seatId?: unknown }) => {
        if (
            !isSocialRoomId(data?.roomId) ||
            typeof data.userId !== 'string' ||
            typeof data.seatId !== 'string'
        ) {
            return;
        }

        io.to(roomSocketName(data.roomId)).emit(
            'room:state',
            store.sit(data.roomId, data.userId, data.seatId),
        );
    });

    socket.on('room:leave', (data: { roomId?: unknown; userId?: unknown }) => {
        if (!isSocialRoomId(data?.roomId) || typeof data.userId !== 'string') return;

        const roomName = roomSocketName(data.roomId);
        socket.leave(roomName);
        io.to(roomName).emit('room:state', store.leave(data.roomId, data.userId));
    });

    socket.on('disconnect', () => {
        for (const state of store.leaveBySocket(socket.id)) {
            io.to(roomSocketName(state.roomId)).emit('room:state', state);
        }
    });
}
