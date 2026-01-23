import { create } from 'zustand';

interface PlayerState {
    currentTrack: any | null;
    isPlaying: boolean;
    setCurrentTrack: (track: any) => void;
    setIsPlaying: (playing: boolean) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
    currentTrack: null,
    isPlaying: false,
    setCurrentTrack: (track) => set({ currentTrack: track }),
    setIsPlaying: (playing) => set({ isPlaying: playing }),
}));
