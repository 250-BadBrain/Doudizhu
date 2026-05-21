export type RoomStatus = 'waiting' | 'ready'

export interface PlayerState {
  id: string
  nickname: string
  isReady: boolean
}

export interface RoomSnapshot {
  roomId: string
  hostId: string
  status: RoomStatus
  maxPlayers: number
  players: PlayerState[]
}