import type { RoomSnapshot, RoomStatus } from './types.js'

interface RoomPlayer {
  id: string
  nickname: string
  isReady: boolean
  joinedAt: number
}

interface RoomEntity {
  roomId: string
  hostId: string
  status: RoomStatus
  maxPlayers: number
  players: Map<string, RoomPlayer>
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomEntity>()

  createRoom(playerId: string, nickname: string) {
    const roomId = this.generateRoomId()
    const room: RoomEntity = {
      roomId,
      hostId: playerId,
      status: 'waiting',
      maxPlayers: 3,
      players: new Map([
        [
          playerId,
          {
            id: playerId,
            nickname,
            isReady: false,
            joinedAt: Date.now(),
          },
        ],
      ]),
    }

    this.rooms.set(roomId, room)
    return this.toSnapshot(room)
  }

  joinRoom(roomId: string, playerId: string, nickname: string) {
    const room = this.rooms.get(roomId)

    if (!room) {
      throw new Error('房间不存在')
    }

    if (room.players.has(playerId)) {
      return this.toSnapshot(room)
    }

    if (room.players.size >= room.maxPlayers) {
      throw new Error('房间人数已满')
    }

    room.players.set(playerId, {
      id: playerId,
      nickname,
      isReady: false,
      joinedAt: Date.now(),
    })
    room.status = 'waiting'
    return this.toSnapshot(room)
  }

  toggleReady(roomId: string, playerId: string, isReady: boolean) {
    const room = this.getRoomEntity(roomId)
    const player = room.players.get(playerId)

    if (!player) {
      throw new Error('玩家不在房间中')
    }

    player.isReady = isReady
    room.status = this.computeStatus(room)
    return this.toSnapshot(room)
  }

  leaveRoom(roomId: string, playerId: string) {
    const room = this.getRoomEntity(roomId)
    room.players.delete(playerId)

    if (room.players.size === 0) {
      this.rooms.delete(roomId)
      return null
    }

    if (room.hostId === playerId) {
      const nextHost = room.players.values().next().value

      if (!nextHost) {
        throw new Error('房间内没有可用玩家')
      }

      room.hostId = nextHost.id
    }

    room.status = this.computeStatus(room)
    return this.toSnapshot(room)
  }

  disconnect(playerId: string) {
    const room = this.findRoomByPlayerId(playerId)

    if (!room) {
      return null
    }

    return {
      roomId: room.roomId,
      snapshot: this.leaveRoom(room.roomId, playerId),
    }
  }

  getRoom(roomId: string) {
    const room = this.rooms.get(roomId)
    return room ? this.toSnapshot(room) : null
  }

  private getRoomEntity(roomId: string) {
    const room = this.rooms.get(roomId)

    if (!room) {
      throw new Error('房间不存在')
    }

    return room
  }

  private findRoomByPlayerId(playerId: string) {
    for (const room of this.rooms.values()) {
      if (room.players.has(playerId)) {
        return room
      }
    }

    return null
  }

  private computeStatus(room: RoomEntity): RoomStatus {
    return room.players.size === room.maxPlayers && [...room.players.values()].every((player) => player.isReady)
      ? 'ready'
      : 'waiting'
  }

  private toSnapshot(room: RoomEntity): RoomSnapshot {
    return {
      roomId: room.roomId,
      hostId: room.hostId,
      status: room.status,
      maxPlayers: room.maxPlayers,
      players: [...room.players.values()]
        .sort((left, right) => left.joinedAt - right.joinedAt)
        .map(({ id, nickname, isReady }) => ({ id, nickname, isReady })),
    }
  }

  private generateRoomId() {
    let roomId = ''

    do {
      roomId = Math.random().toString(36).slice(2, 8).toUpperCase()
    } while (this.rooms.has(roomId))

    return roomId
  }

  // ─── Persistence helpers ──────────────────────────────────────────────

  serialize() {
    const result: {
      roomId: string
      hostId: string
      status: string
      maxPlayers: number
      players: { id: string; nickname: string; isReady: boolean; joinedAt: number }[]
    }[] = []

    for (const room of this.rooms.values()) {
      result.push({
        roomId: room.roomId,
        hostId: room.hostId,
        status: room.status,
        maxPlayers: room.maxPlayers,
        players: [...room.players.values()].map((p) => ({
          id: p.id,
          nickname: p.nickname,
          isReady: p.isReady,
          joinedAt: p.joinedAt,
        })),
      })
    }

    return result
  }

  deserializeRoom(data: {
    roomId: string
    hostId: string
    status: string
    maxPlayers: number
    players: { id: string; nickname: string; isReady: boolean; joinedAt: number }[]
  }) {
    const players = new Map<string, RoomPlayer>()
    for (const p of data.players) {
      players.set(p.id, { id: p.id, nickname: p.nickname, isReady: p.isReady, joinedAt: p.joinedAt })
    }

    this.rooms.set(data.roomId, {
      roomId: data.roomId,
      hostId: data.hostId,
      status: data.status as RoomStatus,
      maxPlayers: data.maxPlayers,
      players,
    })
  }
}