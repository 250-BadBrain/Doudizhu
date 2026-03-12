import { clsx } from 'clsx'
import './App.css'
import { useRoomSocket } from './hooks/useRoomSocket'
import { useGameStore } from './store/gameStore'

function App() {
  const {
    connectionStatus,
    nickname,
    roomIdInput,
    currentRoom,
    error,
    logs,
    setNickname,
    setRoomIdInput,
    clearError,
  } = useGameStore()

  const { createRoom, joinRoom, leaveRoom, toggleReady } = useRoomSocket()

  const canCreate = nickname.trim().length >= 2
  const canJoin = canCreate && roomIdInput.trim().length >= 4
  const me = currentRoom?.players.find((player) => player.id === connectionStatus.socketId)

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero__content">
          <p className="eyebrow">Online Doudizhu</p>
          <h1>为联机斗地主预留好的前端骨架</h1>
          <p className="hero__desc">
            现在已经接好 Socket.IO 通道、房间状态管理和基础大厅界面。后续只需要继续补发牌、叫地主、出牌校验与战绩持久化。
          </p>

          <div className="status-row">
            <span
              className={clsx('status-pill', {
                'status-pill--online': connectionStatus.connected,
                'status-pill--offline': !connectionStatus.connected,
              })}
            >
              {connectionStatus.connected ? '已连接服务器' : '服务器未连接'}
            </span>
            <span className="status-meta">
              {connectionStatus.socketId ? `Socket: ${connectionStatus.socketId}` : '等待握手'}
            </span>
          </div>
        </div>

        <div className="hero__card panel">
          <label className="field">
            <span>昵称</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="例如：BadBrain"
              maxLength={18}
            />
          </label>

          <label className="field">
            <span>房间号</span>
            <input
              value={roomIdInput}
              onChange={(event) => setRoomIdInput(event.target.value.toUpperCase())}
              placeholder="输入 6 位房间号"
              maxLength={6}
            />
          </label>

          <div className="actions">
            <button disabled={!canCreate || !connectionStatus.connected} onClick={createRoom}>
              创建房间
            </button>
            <button disabled={!canJoin || !connectionStatus.connected} onClick={joinRoom}>
              加入房间
            </button>
            <button className="button-ghost" disabled={!currentRoom} onClick={leaveRoom}>
              离开房间
            </button>
          </div>

          {error ? (
            <div className="error-banner" role="alert" onClick={clearError}>
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <section className="dashboard">
        <article className="panel room-panel">
          <div className="panel__header">
            <div>
              <p className="panel__label">当前房间</p>
              <h2>{currentRoom ? currentRoom.roomId : '尚未进入房间'}</h2>
            </div>
            <div className="room-summary">
              <span>{currentRoom ? `${currentRoom.players.length}/3` : '0/3'} 玩家</span>
              <span>{currentRoom?.status === 'ready' ? '可进入对局' : '等待准备'}</span>
            </div>
          </div>

          <div className="player-grid">
            {currentRoom?.players.length ? (
              currentRoom.players.map((player) => (
                <div
                  key={player.id}
                  className={clsx('player-card', {
                    'player-card--ready': player.isReady,
                    'player-card--me': player.id === connectionStatus.socketId,
                  })}
                >
                  <div>
                    <p className="player-name">{player.nickname}</p>
                    <p className="player-meta">{player.id === currentRoom.hostId ? '房主' : '成员'}</p>
                  </div>
                  <strong>{player.isReady ? '已准备' : '未准备'}</strong>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>创建或加入房间后，这里会显示三位玩家的占位和准备状态。</p>
              </div>
            )}
          </div>

          <div className="actions actions--inline">
            <button disabled={!currentRoom || !me} onClick={() => toggleReady(!(me?.isReady ?? false))}>
              {me?.isReady ? '取消准备' : '切换准备'}
            </button>
          </div>
        </article>

        <article className="panel notes-panel">
          <div className="panel__header">
            <div>
              <p className="panel__label">开发里程碑</p>
              <h2>下一步实现建议</h2>
            </div>
          </div>

          <ul className="milestones">
            <li>发牌与牌型判断模块独立到共享规则包或后端服务层。</li>
            <li>增加叫地主、抢地主、出牌回合与托管逻辑。</li>
            <li>接入登录体系和战绩存储，区分游客与正式账号。</li>
            <li>域名侧只暴露前端，后端通过内网穿透地址给 Socket.IO 使用。</li>
          </ul>
        </article>

        <article className="panel log-panel">
          <div className="panel__header">
            <div>
              <p className="panel__label">房间日志</p>
              <h2>实时事件流</h2>
            </div>
          </div>

          <div className="log-list">
            {logs.length ? (
              logs.map((item) => (
                <div key={item.id} className="log-item">
                  <span>{item.time}</span>
                  <p>{item.message}</p>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>等待服务器事件...</p>
              </div>
            )}
          </div>
        </article>
      </section>
    </main>
  )
}

export default App
