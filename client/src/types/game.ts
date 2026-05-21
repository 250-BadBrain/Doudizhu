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

export type GamePhase = 'idle' | 'bidding' | 'playing' | 'finished'

export interface GamePlayerView {
  id: string
  nickname: string
  role: 'landlord' | 'farmer' | null
  handCount: number
  hand: string[]
}

export interface GameLastPlay {
  playerId: string
  cards: string[]
}

export interface GameSnapshot {
  roomId: string
  phase: GamePhase
  players: GamePlayerView[]
  currentTurn: string | null
  currentBid: number
  bottomCards: string[]
  lastPlay: GameLastPlay | null
  passCount: number
  winnerId: string | null
  message: string
  dealtAt: number
}