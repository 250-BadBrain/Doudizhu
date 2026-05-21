import { RoomManager } from './game/room-manager.js'
import {
  buildDeck,
  canBeat,
  parseCombo,
  removeCards,
  shuffle,
  sortCards,
  type Card,
  type Combo,
} from '@doudizhu/shared/cards'

type ClientEvent =
  | { event: 'room:create'; data: { nickname: string } }
  | { event: 'room:join'; data: { roomId: string; nickname: string } }
  | { event: 'room:ready'; data: { roomId: string; isReady: boolean } }
  | { event: 'room:leave'; data: { roomId: string } }
  | { event: 'game:start'; data: { roomId: string } }
  | { event: 'game:call'; data: { roomId: string; score: number } }
  | { event: 'game:play'; data: { roomId: string; cards: Card[] } }
  | { event: 'game:pass'; data: { roomId: string } }
  | { event: 'session:restore'; data: { oldSessionId: string } }

interface Env {
  GAME_STATE: DurableObjectNamespace
  ALLOWED_ORIGIN?: string
}

interface LastPlay {
  playerId: string
  cards: Card[]
  combo: Combo
}

interface DisconnectedInfo {
  roomId: string
  playerId: string
  timer: number | null
}

interface GameState {
  roomId: string
  phase: 'idle' | 'bidding' | 'playing' | 'finished'
  seats: string[]
  hands: Map<string, Card[]>
  roles: Map<string, 'landlord' | 'farmer'>
  currentTurn: string | null
  currentBid: number
  biddingStarter: string | null
  bottomCards: Card[]
  lastPlay: LastPlay | null
  passCount: number
  winnerId: string | null
  message: string
  dealtAt: number
}

interface PersistedLastPlay {
  playerId: string
  cards: Card[]
  combo: { type: string; mainRank: number; length: number; cards: Card[] }
}

interface PersistedGame {
  roomId: string
  phase: string
  seats: string[]
  hands: [string, Card[]][]
  roles: [string, string][]
  currentTurn: string | null
  currentBid: number
  biddingStarter: string | null
  bottomCards: Card[]
  lastPlay: PersistedLastPlay | null
  passCount: number
  winnerId: string | null
  message: string
  dealtAt: number
}

interface PersistedRoom {
  roomId: string
  hostId: string
  status: string
  maxPlayers: number
  players: { id: string; nickname: string; isReady: boolean; joinedAt: number }[]
}

interface PersistedState {
  rooms: PersistedRoom[]
  games: [string, PersistedGame][]
}

const DISCONNECT_TIMEOUT_MS = 30_000
const serviceName = 'doudizhu-server'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const isWebSocketUpgrade = request.headers.get('Upgrade')?.toLowerCase() === 'websocket'

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), request, env)
    }

    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return withCors(Response.json({ ok: true, service: serviceName }), request, env)
    }

    if (!url.pathname.startsWith('/ws') && !url.pathname.startsWith('/rooms/')) {
      return withCors(Response.json({ message: 'Not found' }, { status: 404 }), request, env)
    }

    if (!isOriginAllowed(request, env)) {
      return withCors(Response.json({ message: 'Origin not allowed' }, { status: 403 }), request, env)
    }

    const stub = env.GAME_STATE.get(env.GAME_STATE.idFromName('global'))
    const response = await stub.fetch(request)

    if (isWebSocketUpgrade || response.status === 101) {
      return response
    }

    return withCors(response, request, env)
  },
}

export class GameStateObject {
  private readonly roomManager = new RoomManager()
  private readonly sessionSockets = new Map<string, WebSocket>()
  private readonly socketSessions = new WeakMap<WebSocket, string>()
  private readonly sessionRooms = new Map<string, string>()
  private readonly roomGames = new Map<string, GameState>()
  private readonly disconnectedSessions = new Map<string, DisconnectedInfo>()

  constructor(private readonly state: DurableObjectState) {
    this.state.blockConcurrencyWhile(async () => {
      await this.loadState()
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/rooms/')) {
      const roomId = url.pathname.slice('/rooms/'.length).toUpperCase()
      const room = this.roomManager.getRoom(roomId)
      if (!room) {
        return Response.json({ message: '房间不存在' }, { status: 404 })
      }
      return Response.json(room)
    }

    if (url.pathname !== '/ws') {
      return Response.json({ message: 'Not found' }, { status: 404 })
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({ message: 'Expected websocket upgrade' }, { status: 426 })
    }

    const sessionId = crypto.randomUUID()
    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair)
    this.state.acceptWebSocket(server)
    this.sessionSockets.set(sessionId, server)
    this.socketSessions.set(server, sessionId)

    this.send(server, 'connect', { socketId: sessionId })
    this.send(server, 'room:message', { message: '连接建立成功' })

    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(webSocket: WebSocket, message: string | ArrayBuffer): void {
    const sessionId = this.socketSessions.get(webSocket)
    if (!sessionId || typeof message !== 'string') return

    try {
      const payload = JSON.parse(message) as ClientEvent
      this.handleClientEvent(sessionId, payload)
    } catch (error) {
      this.sendError(sessionId, toMessage(error))
    }
  }

  webSocketClose(webSocket: WebSocket): void {
    const sessionId = this.socketSessions.get(webSocket)
    if (!sessionId) return
    this.handleDisconnect(sessionId)
  }

  webSocketError(webSocket: WebSocket): void {
    const sessionId = this.socketSessions.get(webSocket)
    if (!sessionId) return
    this.handleDisconnect(sessionId)
  }

  // ─── Persistence ────────────────────────────────────────────────────

  private async saveState(): Promise<void> {
    const games: [string, PersistedGame][] = []
    for (const [roomId, g] of this.roomGames) {
      games.push([
        roomId,
        {
          roomId: g.roomId,
          phase: g.phase,
          seats: g.seats,
          hands: [...g.hands.entries()],
          roles: [...g.roles.entries()],
          currentTurn: g.currentTurn,
          currentBid: g.currentBid,
          biddingStarter: g.biddingStarter,
          bottomCards: g.bottomCards,
          lastPlay: g.lastPlay
            ? {
                playerId: g.lastPlay.playerId,
                cards: g.lastPlay.cards,
                combo: { ...g.lastPlay.combo },
              }
            : null,
          passCount: g.passCount,
          winnerId: g.winnerId,
          message: g.message,
          dealtAt: g.dealtAt,
        },
      ])
    }

    const state: PersistedState = {
      rooms: this.roomManager.serialize(),
      games,
    }

    await this.state.storage.put('state', state)
  }

  private async loadState(): Promise<void> {
    const stored = await this.state.storage.get<PersistedState>('state')
    if (!stored) return

    for (const roomData of stored.rooms) {
      this.roomManager.deserializeRoom(roomData)
    }

    for (const [roomId, g] of stored.games) {
      const hands = new Map<string, Card[]>(g.hands.map((entry: [string, Card[]]) => [entry[0], entry[1]]))
      const roles = new Map<string, 'landlord' | 'farmer'>(
        g.roles.map((entry: [string, string]) => [entry[0], entry[1] as 'landlord' | 'farmer']),
      )

      const game: GameState = {
        roomId: g.roomId,
        phase: g.phase as GameState['phase'],
        seats: g.seats,
        hands,
        roles,
        currentTurn: g.currentTurn,
        currentBid: g.currentBid,
        biddingStarter: g.biddingStarter,
        bottomCards: g.bottomCards,
        lastPlay: g.lastPlay
          ? {
              playerId: g.lastPlay.playerId,
              cards: g.lastPlay.cards,
              combo: g.lastPlay.combo as Combo,
            }
          : null,
        passCount: g.passCount,
        winnerId: g.winnerId,
        message: g.message,
        dealtAt: g.dealtAt,
      }

      this.roomGames.set(roomId, game)
    }
  }

  // ─── Disconnect / Reconnect ──────────────────────────────────────────

  private handleDisconnect(sessionId: string): void {
    this.sessionSockets.delete(sessionId)

    const roomId = this.sessionRooms.get(sessionId)
    if (!roomId) return

    const game = this.roomGames.get(roomId)

    if (game && (game.phase === 'bidding' || game.phase === 'playing')) {
      this.disconnectedSessions.set(sessionId, {
        roomId,
        playerId: sessionId,
        timer: null,
      })

      this.scheduleAutoPlay(sessionId, roomId, game, sessionId)
      return
    }

    const result = this.roomManager.disconnect(sessionId)
    this.sessionRooms.delete(sessionId)

    if (result?.snapshot) {
      this.broadcastRoom(result.roomId, 'room:update', result.snapshot)
      this.broadcastRoom(result.roomId, 'room:message', { message: '有玩家断开连接' })
      this.broadcastGame(result.roomId)
      this.saveState()
      return
    }

    if (roomId) {
      this.clearGameIfRoomGone(roomId)
    }
  }

  private scheduleAutoPlay(sessionId: string, roomId: string, game: GameState, playerId: string): void {
    const existing = this.disconnectedSessions.get(sessionId)
    if (existing?.timer !== null) {
      clearTimeout(existing?.timer ?? 0)
    }

    const isMyTurn = game.currentTurn === playerId
    if (!isMyTurn) return

    const timer = setTimeout(() => {
      this.executeAutoPlay(sessionId, roomId, playerId)
    }, DISCONNECT_TIMEOUT_MS)

    const info = this.disconnectedSessions.get(sessionId)
    if (info) {
      info.timer = timer as unknown as number
    }
  }

  private executeAutoPlay(sessionId: string, roomId: string, playerId: string): void {
    const game = this.roomGames.get(roomId)
    if (!game) return
    if (game.currentTurn !== playerId) return

    const info = this.disconnectedSessions.get(sessionId)
    if (!info) return

    try {
      if (game.phase === 'bidding') {
        this.callScoreInternal(roomId, playerId, 0)
        this.broadcastRoom(roomId, 'room:message', {
          message: `${this.nicknameOf(roomId, playerId)} 超时不叫，自动出 0`,
        })
      } else if (game.phase === 'playing') {
        if (game.lastPlay) {
          this.passTurnInternal(roomId, playerId)
          this.broadcastRoom(roomId, 'room:message', {
            message: `${this.nicknameOf(roomId, playerId)} 超时不出，自动过牌`,
          })
        } else {
          const hand = game.hands.get(playerId)
          if (hand && hand.length > 0) {
            this.playCardsInternal(roomId, playerId, [hand[0]])
            this.broadcastRoom(roomId, 'room:message', {
              message: `${this.nicknameOf(roomId, playerId)} 超时自动出牌`,
            })
          }
        }
      }
    } catch {
      // If auto-play fails, do nothing (game may have changed state)
    }
  }

  private restorePlayerSession(newSessionId: string, oldSessionId: string, webSocket: WebSocket): boolean {
    const info = this.disconnectedSessions.get(oldSessionId)
    if (!info) return false

    if (info.timer !== null) {
      clearTimeout(info.timer)
    }

    this.disconnectedSessions.delete(oldSessionId)
    this.sessionSockets.set(oldSessionId, webSocket)
    this.socketSessions.set(webSocket, oldSessionId)
    this.sessionRooms.set(oldSessionId, info.roomId)

    const room = this.roomManager.getRoom(info.roomId)
    if (room) {
      this.send(oldSessionId, 'room:update', room)
    }

    this.broadcastGame(info.roomId)
    this.send(oldSessionId, 'room:message', { message: '连接已恢复' })
    return true
  }

  // ─── Client Event Router ─────────────────────────────────────────────

  private handleClientEvent(sessionId: string, payload: ClientEvent): void {
    switch (payload.event) {
      case 'session:restore': {
        const oldSessionId = payload.data.oldSessionId
        const socket = this.sessionSockets.get(sessionId)
        if (socket && oldSessionId && oldSessionId !== sessionId) {
          if (this.restorePlayerSession(sessionId, oldSessionId, socket)) {
            this.send(sessionId, 'session:restored', { ok: true })
          } else {
            this.send(sessionId, 'session:restored', { ok: false })
          }
        }
        return
      }

      case 'room:create': {
        const nickname = payload.data.nickname?.trim()
        if (!nickname || nickname.length < 2) throw new Error('昵称至少需要 2 个字符')

        this.leaveCurrentRoom(sessionId)
        const room = this.roomManager.createRoom(sessionId, nickname)
        this.sessionRooms.set(sessionId, room.roomId)
        this.send(sessionId, 'room:update', room)
        this.send(sessionId, 'room:message', { message: `房间 ${room.roomId} 创建成功` })
        this.saveState()
        return
      }

      case 'room:join': {
        const roomId = payload.data.roomId?.trim().toUpperCase()
        const nickname = payload.data.nickname?.trim()

        if (!roomId) throw new Error('房间号不能为空')
        if (!nickname || nickname.length < 2) throw new Error('昵称至少需要 2 个字符')

        const runningGame = this.roomGames.get(roomId)
        if (runningGame && (runningGame.phase === 'bidding' || runningGame.phase === 'playing')) {
          throw new Error('该房间对局进行中，暂不允许加入')
        }
        if (runningGame && runningGame.phase === 'finished') {
          this.roomGames.delete(roomId)
        }

        this.leaveCurrentRoom(sessionId)
        const room = this.roomManager.joinRoom(roomId, sessionId, nickname)
        this.sessionRooms.set(sessionId, room.roomId)
        this.broadcastRoom(room.roomId, 'room:update', room)
        this.broadcastRoom(room.roomId, 'room:message', { message: `${nickname} 加入了房间 ${room.roomId}` })
        this.saveState()
        return
      }

      case 'room:ready': {
        const roomId = payload.data.roomId
        const game = this.roomGames.get(roomId)
        if (game && (game.phase === 'bidding' || game.phase === 'playing')) {
          throw new Error('对局进行中，无法修改准备状态')
        }
        if (game && game.phase === 'finished') {
          this.roomGames.delete(roomId)
        }

        const room = this.roomManager.toggleReady(roomId, sessionId, payload.data.isReady)
        this.broadcastRoom(room.roomId, 'room:update', room)
        this.broadcastRoom(room.roomId, 'room:message', {
          message: room.status === 'ready' ? '三人均已准备，可以开始对局' : '房间准备状态已更新',
        })
        this.saveState()
        return
      }

      case 'room:leave': {
        this.handleExplicitLeave(payload.data.roomId, sessionId)
        return
      }

      case 'game:start': {
        this.startGame(sessionId, payload.data.roomId)
        return
      }

      case 'game:call': {
        this.callScore(sessionId, payload.data.roomId, payload.data.score)
        return
      }

      case 'game:play': {
        this.playCards(sessionId, payload.data.roomId, payload.data.cards)
        return
      }

      case 'game:pass': {
        this.passTurn(sessionId, payload.data.roomId)
        return
      }
    }
  }

  // ─── Explicit Leave (different from disconnect) ──────────────────────

  private handleExplicitLeave(roomId: string, sessionId: string): void {
    const game = this.roomGames.get(roomId)
    if (game && game.phase === 'playing') {
      this.broadcastRoom(roomId, 'room:message', {
        message: '对局进行中，无法退出房间',
      })
      return
    }

    const room = this.roomManager.leaveRoom(roomId, sessionId)
    this.sessionRooms.delete(sessionId)
    this.clearGameIfRoomGone(roomId)
    if (room) {
      this.broadcastRoom(room.roomId, 'room:update', room)
      this.broadcastRoom(room.roomId, 'room:message', { message: '有玩家离开房间' })
      this.broadcastGame(room.roomId)
    }
    this.saveState()
  }

  // ─── Game Logic ──────────────────────────────────────────────────────

  private startGame(sessionId: string, roomId: string): void {
    const room = this.getRoomOrThrow(roomId)
    if (room.hostId !== sessionId) throw new Error('仅房主可开始对局')
    if (room.players.length !== 3 || room.status !== 'ready') throw new Error('三名玩家全部准备后才能开局')

    const seats = room.players.map((player) => player.id)
    const cards = shuffle(buildDeck())
    const hands = new Map<string, Card[]>()
    for (let index = 0; index < seats.length; index += 1) {
      hands.set(seats[index], sortCards(cards.slice(index * 17, index * 17 + 17)))
    }

    const game: GameState = {
      roomId,
      phase: 'bidding',
      seats,
      hands,
      roles: new Map(seats.map((id) => [id, 'farmer' as const])),
      currentTurn: seats[0],
      currentBid: 0,
      biddingStarter: seats[0],
      bottomCards: sortCards(cards.slice(51)),
      lastPlay: null,
      passCount: 0,
      winnerId: null,
      message: '对局开始，请轮流叫分（0-3）',
      dealtAt: Date.now(),
    }

    this.roomGames.set(roomId, game)
    this.broadcastGame(roomId)
    this.saveState()
  }

  private callScore(sessionId: string, roomId: string, score: number): void {
    this.callScoreInternal(roomId, sessionId, score)
  }

  private callScoreInternal(roomId: string, playerId: string, score: number): void {
    const game = this.getGameOrThrow(roomId)
    if (game.phase !== 'bidding') throw new Error('当前不在叫分阶段')
    if (game.currentTurn !== playerId) throw new Error('还未轮到你叫分')
    if (!Number.isInteger(score) || (score !== 0 && score < game.currentBid) || score > 3) {
      throw new Error(`叫分必须为 0（不叫）或 ${game.currentBid} 到 3 之间`)
    }

    const previousStarter = game.biddingStarter ?? playerId
    if (score > game.currentBid) {
      game.currentBid = score
      game.biddingStarter = playerId
    }

    const currentIndex = game.seats.indexOf(playerId)
    const nextPlayer = game.seats[(currentIndex + 1) % game.seats.length]
    const endBidding = nextPlayer === previousStarter || game.currentBid === 3

    if (endBidding) {
      const landlordId = game.biddingStarter ?? playerId
      game.phase = 'playing'
      game.currentTurn = landlordId
      game.roles = new Map(game.seats.map((id) => [id, id === landlordId ? 'landlord' : 'farmer']))
      const landlordHand = game.hands.get(landlordId) ?? []
      game.hands.set(landlordId, sortCards([...landlordHand, ...game.bottomCards]))
      game.message = `地主确定：${this.nicknameOf(roomId, landlordId)}，请出牌`
      this.broadcastGame(roomId)
      this.saveState()
      return
    }

    game.currentTurn = nextPlayer
    game.message = `${this.nicknameOf(roomId, playerId)} 叫分 ${score}`
    this.broadcastGame(roomId)
    this.saveState()
  }

  private playCards(sessionId: string, roomId: string, cards: Card[]): void {
    this.playCardsInternal(roomId, sessionId, cards)
  }

  private playCardsInternal(roomId: string, playerId: string, cards: Card[]): void {
    const game = this.getGameOrThrow(roomId)
    if (game.phase !== 'playing') throw new Error('当前不在出牌阶段')
    if (game.currentTurn !== playerId) throw new Error('还未轮到你出牌')

    const hand = game.hands.get(playerId)
    if (!hand) throw new Error('玩家手牌不存在')

    const sortedCards = sortCards(cards)
    const nextCombo = parseCombo(sortedCards)
    if (!nextCombo) throw new Error('不是合法牌型')

    const currentCombo = game.lastPlay ? parseCombo(game.lastPlay.cards) : null
    if (!canBeat(nextCombo, currentCombo)) throw new Error('无法压过当前桌面牌')

    const nextHand = removeCards(hand, sortedCards)
    game.hands.set(playerId, nextHand)
    game.lastPlay = { playerId, cards: sortedCards, combo: nextCombo }
    game.passCount = 0

    if (nextHand.length === 0) {
      game.phase = 'finished'
      game.currentTurn = null
      game.winnerId = playerId
      game.message = `${this.nicknameOf(roomId, playerId)} 获胜，本局结束`
      this.broadcastGame(roomId)
      this.saveState()
      return
    }

    const currentIndex = game.seats.indexOf(playerId)
    game.currentTurn = game.seats[(currentIndex + 1) % game.seats.length]
    game.message = `${this.nicknameOf(roomId, playerId)} 出牌`
    this.broadcastGame(roomId)
    this.saveState()
  }

  private passTurn(sessionId: string, roomId: string): void {
    this.passTurnInternal(roomId, sessionId)
  }

  private passTurnInternal(roomId: string, playerId: string): void {
    const game = this.getGameOrThrow(roomId)
    if (game.phase !== 'playing') throw new Error('当前不在出牌阶段')
    if (game.currentTurn !== playerId) throw new Error('还未轮到你出牌')
    if (!game.lastPlay) throw new Error('首出不能不出')

    game.passCount += 1
    if (game.passCount >= 2) {
      const winner = game.lastPlay.playerId
      game.currentTurn = winner
      game.lastPlay = null
      game.passCount = 0
      game.message = '其余两家不出，出牌权回到上轮赢家'
      this.broadcastGame(roomId)
      this.saveState()
      return
    }

    const currentIndex = game.seats.indexOf(playerId)
    game.currentTurn = game.seats[(currentIndex + 1) % game.seats.length]
    game.message = `${this.nicknameOf(roomId, playerId)} 不出`
    this.broadcastGame(roomId)
    this.saveState()
  }

  // ─── Broadcast ───────────────────────────────────────────────────────

  private broadcastGame(roomId: string): void {
    const game = this.roomGames.get(roomId)
    const room = this.roomManager.getRoom(roomId)
    if (!game || !room) return

    for (const player of room.players) {
      this.send(player.id, 'game:update', this.toClientGameState(game, roomId, player.id))
    }
  }

  private toClientGameState(game: GameState, roomId: string, viewerId: string) {
    const room = this.getRoomOrThrow(roomId)

    return {
      roomId,
      phase: game.phase,
      players: room.players.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        role: game.phase === 'idle' ? null : (game.roles.get(player.id) ?? 'farmer'),
        handCount: (game.hands.get(player.id) ?? []).length,
        hand: player.id === viewerId ? (game.hands.get(player.id) ?? []) : [],
      })),
      currentTurn: game.currentTurn,
      currentBid: game.currentBid,
      bottomCards: game.phase === 'bidding' || game.phase === 'idle' ? [] : game.bottomCards,
      lastPlay: game.lastPlay
        ? {
            playerId: game.lastPlay.playerId,
            cards: game.lastPlay.cards,
          }
        : null,
      passCount: game.passCount,
      winnerId: game.winnerId,
      message: game.message,
      dealtAt: game.dealtAt,
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private getGameOrThrow(roomId: string): GameState {
    const game = this.roomGames.get(roomId)
    if (!game) throw new Error('该房间尚未开始对局')
    return game
  }

  private getRoomOrThrow(roomId: string) {
    const room = this.roomManager.getRoom(roomId)
    if (!room) throw new Error('房间不存在')
    return room
  }

  private nicknameOf(roomId: string, playerId: string): string {
    const room = this.roomManager.getRoom(roomId)
    if (!room) return '玩家'
    return room.players.find((player) => player.id === playerId)?.nickname ?? '玩家'
  }

  private clearGameIfRoomGone(roomId: string): void {
    const room = this.roomManager.getRoom(roomId)
    if (!room) this.roomGames.delete(roomId)
  }

  private leaveCurrentRoom(sessionId: string): void {
    const currentRoomId = this.sessionRooms.get(sessionId)
    if (!currentRoomId) return

    const room = this.roomManager.leaveRoom(currentRoomId, sessionId)
    this.sessionRooms.delete(sessionId)
    this.clearGameIfRoomGone(currentRoomId)
    if (room) {
      this.broadcastRoom(room.roomId, 'room:update', room)
      this.broadcastRoom(room.roomId, 'room:message', { message: '有玩家离开房间' })
      this.broadcastGame(room.roomId)
    }
  }

  private broadcastRoom(roomId: string, event: string, data: unknown): void {
    const room = this.roomManager.getRoom(roomId)
    if (!room) return

    for (const player of room.players) {
      this.send(player.id, event, data)
    }
  }

  private send(target: string | WebSocket, event: string, data: unknown): void {
    const socket = typeof target === 'string' ? this.sessionSockets.get(target) : target
    if (!socket) return
    socket.send(JSON.stringify({ event, data }))
  }

  private sendError(sessionId: string, message: string): void {
    this.send(sessionId, 'room:error', { message })
  }
}

// ─── CORS & Helpers ────────────────────────────────────────────────────

function withCors(response: Response, request: Request, env: Env): Response {
  const allowedOrigin = resolveAllowedOrigin(request, env)
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', allowedOrigin)
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  headers.set('Access-Control-Allow-Headers', request.headers.get('Access-Control-Request-Headers') ?? '*')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function isOriginAllowed(request: Request, env: Env): boolean {
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGIN)
  const requestOrigin = request.headers.get('Origin')
  if (allowedOrigins.length === 0 || !requestOrigin) return true
  return allowedOrigins.includes(requestOrigin)
}

function resolveAllowedOrigin(request: Request, env: Env): string {
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGIN)
  const requestOrigin = request.headers.get('Origin')
  if (allowedOrigins.length === 0) return '*'
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) return requestOrigin
  return allowedOrigins[0]
}

function parseAllowedOrigins(value?: string): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误'
}
