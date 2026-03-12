import { useEffect } from 'react'
import { socket } from '../lib/socket'
import { useGameStore } from '../store/gameStore'
import type { RoomSnapshot } from '../types/game'

export function useRoomSocket() {
  const {
    nickname,
    roomIdInput,
    currentRoom,
    setConnectionStatus,
    setCurrentRoom,
    pushLog,
    setError,
  } = useGameStore()

  useEffect(() => {
    const onConnect = () => {
      setConnectionStatus({ connected: true, socketId: socket.id ?? null })
      pushLog('已连接到实时服务')
    }

    const onDisconnect = () => {
      setConnectionStatus({ connected: false, socketId: null })
      pushLog('与服务器连接断开')
    }

    const onRoomUpdate = (room: RoomSnapshot) => {
      setCurrentRoom(room)
      pushLog(`房间 ${room.roomId} 状态更新，当前 ${room.players.length} 名玩家`)
    }

    const onRoomError = (payload: { message: string }) => {
      setError(payload.message)
      pushLog(`错误：${payload.message}`)
    }

    const onRoomMessage = (payload: { message: string }) => {
      pushLog(payload.message)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room:update', onRoomUpdate)
    socket.on('room:error', onRoomError)
    socket.on('room:message', onRoomMessage)

    if (socket.connected) {
      onConnect()
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room:update', onRoomUpdate)
      socket.off('room:error', onRoomError)
      socket.off('room:message', onRoomMessage)
    }
  }, [pushLog, setConnectionStatus, setCurrentRoom, setError])

  return {
    createRoom: () => {
      socket.emit('room:create', { nickname: nickname.trim() })
    },
    joinRoom: () => {
      socket.emit('room:join', {
        roomId: roomIdInput.trim().toUpperCase(),
        nickname: nickname.trim(),
      })
    },
    leaveRoom: () => {
      if (!currentRoom) {
        return
      }

      socket.emit('room:leave', {
        roomId: currentRoom.roomId,
      })
      setCurrentRoom(null)
    },
    toggleReady: (isReady: boolean) => {
      if (!currentRoom) {
        return
      }

      socket.emit('room:ready', {
        roomId: currentRoom.roomId,
        isReady,
      })
    },
  }
}