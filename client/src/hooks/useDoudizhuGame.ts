import { useEffect, useMemo, useRef, useState } from 'react'
import { parseCombo, canBeat, sortCards, type Card } from '../lib/doudizhu'
import { socket } from '../lib/socket'
import { useGameStore } from '../store/gameStore'
import type { GameSnapshot, RoomSnapshot } from '../types/game'

interface UseDoudizhuGameParams {
  room: RoomSnapshot | null
  myId: string | null
}

const emptySnapshot: GameSnapshot = {
  roomId: '',
  phase: 'idle',
  players: [],
  currentTurn: null,
  currentBid: 0,
  bottomCards: [],
  lastPlay: null,
  passCount: 0,
  winnerId: null,
  message: '等待开始新对局',
  dealtAt: 0,
}

export function useDoudizhuGame({ room, myId }: UseDoudizhuGameParams) {
  const [snapshot, setSnapshot] = useState<GameSnapshot>(emptySnapshot)
  const [selectedCards, setSelectedCards] = useState<Card[]>([])
  const [pendingAction, setPendingAction] = useState<'start' | 'call' | null>(null)
  const pendingTimerRef = useRef<number | null>(null)
  const { pushLog } = useGameStore()

  function clearPendingAction() {
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current)
      pendingTimerRef.current = null
    }
    setPendingAction(null)
  }

  function holdPendingAction(action: 'start' | 'call') {
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current)
      pendingTimerRef.current = null
    }

    setPendingAction(action)
    pendingTimerRef.current = window.setTimeout(() => {
      setPendingAction((current) => {
        if (current !== action) {
          return current
        }
        pushLog('操作等待超时，请检查网络后重试')
        pendingTimerRef.current = null
        return null
      })
    }, 5000)
  }

  useEffect(() => {
    const onGameUpdate = (next: GameSnapshot) => {
      setSnapshot(next)
      setSelectedCards([])
      clearPendingAction()
      if (next.message) {
        pushLog(next.message)
      }
    }

    socket.on('game:update', onGameUpdate)
    return () => {
      socket.off('game:update', onGameUpdate)
    }
  }, [pushLog])

  useEffect(() => {
    const onRoomError = () => clearPendingAction()
    const onRoomUpdate = () => clearPendingAction()
    const onRoomMessage = () => clearPendingAction()
    const onDisconnect = () => clearPendingAction()

    socket.on('room:error', onRoomError)
    socket.on('room:update', onRoomUpdate)
    socket.on('room:message', onRoomMessage)
    socket.on('disconnect', onDisconnect)

    return () => {
      socket.off('room:error', onRoomError)
      socket.off('room:update', onRoomUpdate)
      socket.off('room:message', onRoomMessage)
      socket.off('disconnect', onDisconnect)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current)
      }
    }
  }, [])

  const prevRoomRef = useRef(room)

  useEffect(() => {
    if (prevRoomRef.current !== room && !room) {
      setSnapshot(emptySnapshot) // eslint-disable-line react-hooks/set-state-in-effect
      setSelectedCards([])
    }
    prevRoomRef.current = room
  }, [room])

  const myPlayer = useMemo(() => snapshot.players.find((player) => player.id === myId) ?? null, [snapshot.players, myId])
  const canStart = Boolean(room && room.players.length === 3 && room.status === 'ready' && myId === room.hostId)

  function startGame(): { ok: boolean; reason?: string } {
    if (!room) {
      return { ok: false, reason: '当前不在房间中' }
    }

    if (!myId) {
      return { ok: false, reason: '连接身份失效，请重新进入房间' }
    }

    if (pendingAction) {
      return { ok: false, reason: '上一条操作仍在处理中' }
    }

    const sent = socket.emit('game:start', { roomId: room.roomId })
    if (!sent) {
      return { ok: false, reason: '网络未连接，发送失败' }
    }

    holdPendingAction('start')
    return { ok: true }
  }

  function callScore(score: number): { ok: boolean; reason?: string } {
    if (!room) {
      return { ok: false, reason: '当前不在房间中' }
    }

    if (!myId) {
      return { ok: false, reason: '连接身份失效，请重新进入房间' }
    }

    if (pendingAction) {
      return { ok: false, reason: '上一条操作仍在处理中' }
    }

    const sent = socket.emit('game:call', { roomId: room.roomId, score })
    if (!sent) {
      return { ok: false, reason: '网络未连接，发送失败' }
    }

    holdPendingAction('call')
    return { ok: true }
  }

  function toggleCard(card: Card) {
    if (snapshot.phase !== 'playing' || snapshot.currentTurn !== myId) {
      return
    }

    setSelectedCards((current) =>
      current.includes(card) ? current.filter((item) => item !== card) : sortCards([...current, card]),
    )
  }

  function playSelected(): { ok: boolean; reason?: string } {
    if (!room || snapshot.phase !== 'playing' || snapshot.currentTurn !== myId) {
      return { ok: false, reason: '当前不能出牌' }
    }

    if (!myId) {
      return { ok: false, reason: '连接身份失效，请重新进入房间' }
    }

    const combo = parseCombo(selectedCards)
    if (!combo) {
      return { ok: false, reason: '当前选牌不是合法牌型' }
    }

    if (snapshot.lastPlay) {
      const currentCombo = parseCombo(snapshot.lastPlay.cards)
      if (currentCombo && !canBeat(combo, currentCombo)) {
        return { ok: false, reason: '牌型无法压过当前桌面牌' }
      }
    }

    const sent = socket.emit('game:play', {
      roomId: room.roomId,
      cards: selectedCards,
    })
    if (!sent) {
      return { ok: false, reason: '网络未连接，发送失败' }
    }
    return { ok: true }
  }

  function pass(): { ok: boolean; reason?: string } {
    if (!room || snapshot.phase !== 'playing' || snapshot.currentTurn !== myId) {
      return { ok: false, reason: '当前不能不出' }
    }

    if (!myId) {
      return { ok: false, reason: '连接身份失效，请重新进入房间' }
    }

    const sent = socket.emit('game:pass', { roomId: room.roomId })
    if (!sent) {
      return { ok: false, reason: '网络未连接，发送失败' }
    }
    return { ok: true }
  }

  function resetGameBoard() {
    setSnapshot(emptySnapshot)
    setSelectedCards([])
  }

  return {
    ...snapshot,
    selectedCards,
    myCards: myPlayer?.hand ?? [],
    pendingAction,
    canStart,
    startGame,
    callScore,
    toggleCard,
    playSelected,
    pass,
    resetGameBoard,
  }
}

export function cardLabel(card: Card): string {
  if (card === 'SJ') {
    return '小王'
  }

  if (card === 'BJ') {
    return '大王'
  }

  return card.slice(0, -1)
}
