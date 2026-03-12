import { create } from 'zustand'
import type { ConnectionStatus, LogEntry, RoomSnapshot } from '../types/game'

interface GameState {
  connectionStatus: ConnectionStatus
  nickname: string
  roomIdInput: string
  currentRoom: RoomSnapshot | null
  error: string | null
  logs: LogEntry[]
  setNickname: (nickname: string) => void
  setRoomIdInput: (roomId: string) => void
  setConnectionStatus: (status: Partial<ConnectionStatus>) => void
  setCurrentRoom: (room: RoomSnapshot | null) => void
  pushLog: (message: string) => void
  setError: (message: string | null) => void
  clearError: () => void
}

const now = () =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date())

export const useGameStore = create<GameState>((set) => ({
  connectionStatus: {
    connected: false,
    socketId: null,
  },
  nickname: '',
  roomIdInput: '',
  currentRoom: null,
  error: null,
  logs: [],
  setNickname: (nickname) => set({ nickname }),
  setRoomIdInput: (roomIdInput) => set({ roomIdInput }),
  setConnectionStatus: (status) =>
    set((state) => ({
      connectionStatus: {
        ...state.connectionStatus,
        ...status,
      },
    })),
  setCurrentRoom: (currentRoom) =>
    set((state) => ({
      currentRoom,
      roomIdInput: currentRoom?.roomId ?? state.roomIdInput,
    })),
  pushLog: (message) =>
    set((state) => ({
      logs: [
        {
          id: `${Date.now()}-${state.logs.length}`,
          message,
          time: now(),
        },
        ...state.logs,
      ].slice(0, 20),
    })),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}))