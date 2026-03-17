import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import './App.css'
import { cardLabel, useDoudizhuGame } from './hooks/useDoudizhuGame'
import { useRoomSocket } from './hooks/useRoomSocket'
import { useGameStore } from './store/gameStore'

function App() {
  const [pathname, setPathname] = useState(window.location.pathname)
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
  const isGamePage = pathname.startsWith('/game')

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigateTo = (nextPath: '/' | '/game') => {
    if (window.location.pathname === nextPath) {
      return
    }

    window.history.pushState({}, '', nextPath)
    setPathname(nextPath)
  }

  const game = useDoudizhuGame({
    room: currentRoom,
    myId: connectionStatus.socketId,
  })
  const gameByPlayer = useMemo(() => new Map(game.players.map((player) => [player.id, player])), [game.players])

  const renderPlayerRole = (playerId: string) => {
    const gamePlayer = gameByPlayer.get(playerId)
    if (game.phase === 'playing' || game.phase === 'finished') {
      return gamePlayer?.role === 'landlord' ? '地主' : '农民'
    }

    return playerId === currentRoom?.hostId ? '房主' : '成员'
  }

  const renderPlayerTail = (playerId: string, isReady: boolean) => {
    const gamePlayer = gameByPlayer.get(playerId)
    if (game.phase === 'playing' || game.phase === 'finished') {
      return `剩余 ${gamePlayer?.hand.length ?? '-'} 张`
    }

    return isReady ? '已准备' : '未准备'
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero__content">
          <p className="eyebrow">Online Doudizhu</p>
          <h1>{isGamePage ? '斗地主游戏页（/game）' : '斗地主联机主页'}</h1>
          <p className="hero__desc">
            {isGamePage
              ? '这是独立的游戏页面路径。你可以从联机主页进入，或直接访问 /game。'
              : '这是联机主界面（/）。完成创建房间和准备后，再进入 /game 开始对局。'}
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
            <button className="button-ghost" disabled={!currentRoom} onClick={() => navigateTo('/game')}>
              进入 /game
            </button>
            {isGamePage ? (
              <button className="button-ghost" onClick={() => navigateTo('/')}>
                返回主页
              </button>
            ) : null}
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
                    <p className="player-meta">{renderPlayerRole(player.id)}</p>
                  </div>
                  <strong>{renderPlayerTail(player.id, player.isReady)}</strong>
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

        {isGamePage ? (
          <article className="panel notes-panel">
            <div className="panel__header">
              <div>
                <p className="panel__label">对局引擎</p>
                <h2>斗地主核心流程</h2>
              </div>
            </div>

            <div className="game-state">
              <p>
                阶段：
                <strong>
                  {game.phase === 'idle'
                    ? '待开始'
                    : game.phase === 'bidding'
                      ? '叫分阶段'
                      : game.phase === 'playing'
                        ? '出牌阶段'
                        : '已结束'}
                </strong>
              </p>
              <p>
                当前叫分：<strong>{game.currentBid}</strong>
              </p>
              <p>
                当前行动：
                <strong>
                  {game.currentTurn
                    ? game.players.find((player) => player.id === game.currentTurn)?.nickname ?? '玩家'
                    : '无'}
                </strong>
              </p>
              <p>{game.message || '等待开始新对局'}</p>
            </div>

            <div className="actions actions--inline">
              <button disabled={!game.canStart} onClick={game.startGame}>
                开始对局
              </button>
              <button className="button-ghost" onClick={game.resetGameBoard}>
                重置棋盘
              </button>
            </div>

            {game.phase === 'bidding' && game.currentTurn === connectionStatus.socketId ? (
              <div className="actions actions--inline bid-actions">
                {[0, 1, 2, 3].map((score) => (
                  <button key={score} disabled={score < game.currentBid} onClick={() => game.callScore(score)}>
                    叫 {score} 分
                  </button>
                ))}
              </div>
            ) : null}

            <div className="last-play">
              <p className="panel__label">桌面牌</p>
              {game.lastPlay ? (
                <p>
                  {game.players.find((player) => player.id === game.lastPlay?.playerId)?.nickname}：
                  {game.lastPlay.cards.map(cardLabel).join(' ')}
                </p>
              ) : (
                <p>当前轮为空，轮到先手玩家自由出牌。</p>
              )}
            </div>

            <div className="hand-section">
              <p className="panel__label">我的手牌（{game.myCards.length}）</p>
              <div className="hand-grid">
                {game.myCards.length ? (
                  game.myCards.map((card) => (
                    <button
                      key={card}
                      className={clsx('card-chip', {
                        'card-chip--selected': game.selectedCards.includes(card),
                      })}
                      disabled={game.phase !== 'playing' || game.currentTurn !== connectionStatus.socketId}
                      onClick={() => game.toggleCard(card)}
                    >
                      {cardLabel(card)}
                    </button>
                  ))
                ) : (
                  <p className="hand-empty">暂无手牌</p>
                )}
              </div>

              <div className="actions actions--inline">
                <button
                  disabled={game.phase !== 'playing' || game.currentTurn !== connectionStatus.socketId}
                  onClick={game.playSelected}
                >
                  出选中牌
                </button>
                <button
                  className="button-ghost"
                  disabled={game.phase !== 'playing' || game.currentTurn !== connectionStatus.socketId}
                  onClick={game.pass}
                >
                  不出
                </button>
              </div>
            </div>
          </article>
        ) : (
          <article className="panel notes-panel">
            <div className="panel__header">
              <div>
                <p className="panel__label">页面结构</p>
                <h2>主页与游戏页已分离</h2>
              </div>
            </div>

            <ul className="milestones">
              <li>联机主页：当前路径 /，负责昵称、房间创建加入、准备。</li>
              <li>游戏页面：路径 /game，负责叫分、出牌和回合推进。</li>
              <li>建议流程：房间 3 人准备完成后，再进入 /game 开局。</li>
            </ul>

            <div className="actions actions--inline">
              <button disabled={!currentRoom} onClick={() => navigateTo('/game')}>
                前往 /game
              </button>
            </div>
          </article>
        )}

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
