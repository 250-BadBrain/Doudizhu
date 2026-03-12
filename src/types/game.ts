export type RoomStatus = 'waiting' | 'ready'

export interface PlayerPresence {
  id: string
  nickname: string
  isReady: boolean
}

export interface RoomSnapshot {
  roomId: string
  hostId: string
  status: RoomStatus
  maxPlayers: number
  players: PlayerPresence[]
}

export interface ConnectionStatus {
  connected: boolean
  socketId: string | null
}

export interface LogEntry {
  id: string
  message: string
  time: string
}