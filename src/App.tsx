import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import './App.css'
import { PlayingCard } from './components/PlayingCard'
import { useDoudizhuGame } from './hooks/useDoudizhuGame'
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
  const game = useDoudizhuGame({ room: currentRoom, myId: connectionStatus.socketId })

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (currentRoom && pathname !== '/game') {
      navigate('/game', setPathname)
    }
  }, [currentRoom, pathname])

  const inGamePage = pathname.startsWith('/game')
  const canCreate = nickname.trim().length >= 2
  const canJoin = canCreate && roomIdInput.trim().length >= 4
  const me = currentRoom?.players.find((player) => player.id === connectionStatus.socketId)
  const gameByPlayer = useMemo(() => new Map(game.players.map((player) => [player.id, player])), [game.players])

  if (!inGamePage) {
    return (
      <main className="shell shell--narrow">
        <section className="hero hero--single">
          <div className="hero__content">
            <p className="eyebrow">Doudizhu Online</p>
            <h1>斗地主联机主界面</h1>
            <p className="hero__desc">在这里完成连线与进房，加入成功后会自动跳转到 /game 游戏页面。</p>

            <div className="status-row">
              <span
                className={clsx('status-pill', {
                  'status-pill--online': connectionStatus.connected,
                  'status-pill--offline': !connectionStatus.connected,
                })}
              >
                {connectionStatus.connected ? '已连接服务器' : '服务器未连接'}
              </span>
              <span className="status-meta">{connectionStatus.socketId ? '握手成功' : '等待握手'}</span>
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
            </div>

            {error ? (
              <div className="error-banner" role="alert" onClick={clearError}>
                {error}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <section className="table-layout">
        <aside className="panel sidebar-panel">
          <div className="panel__header">
            <div>
              <p className="panel__label">房间信息</p>
              <h2>{currentRoom?.roomId ?? '未在房间中'}</h2>
            </div>
          </div>

          <div className="room-summary">
            <span>{currentRoom ? `${currentRoom.players.length}/3 玩家` : '0/3 玩家'}</span>
            <span>{currentRoom?.status === 'ready' ? '可开局' : '等待准备'}</span>
          </div>

          <div className="player-list">
            {currentRoom?.players.map((player) => {
              const gamePlayer = gameByPlayer.get(player.id)
              const role =
                game.phase === 'playing' || game.phase === 'finished'
                  ? gamePlayer?.role === 'landlord'
                    ? '地主'
                    : '农民'
                  : player.id === currentRoom.hostId
                    ? '房主'
                    : '成员'

              return (
                <div key={player.id} className={clsx('player-item', { 'player-item--me': player.id === me?.id })}>
                  <div>
                    <p className="player-name">{player.nickname}</p>
                    <p className="player-meta">{role}</p>
                  </div>
                  <strong>
                    {game.phase === 'playing' || game.phase === 'finished'
                      ? `${gamePlayer?.hand.length ?? '-'} 张`
                      : player.isReady
                        ? '已准备'
                        : '未准备'}
                  </strong>
                </div>
              )
            })}
          </div>

          <div className="actions actions--inline">
            <button disabled={!currentRoom || !me} onClick={() => toggleReady(!(me?.isReady ?? false))}>
              {me?.isReady ? '取消准备' : '切换准备'}
            </button>
            <button className="button-ghost" disabled={!currentRoom} onClick={leaveRoom}>
              离开房间
            </button>
            <button className="button-ghost" onClick={() => navigate('/', setPathname)}>
              返回主页
            </button>
          </div>
        </aside>

        <section className="board-section">
          <article className="panel board-panel">
            <div className="board-top">
              <div>
                <p className="panel__label">对局状态</p>
                <h2>
                  {game.phase === 'idle'
                    ? '等待开始'
                    : game.phase === 'bidding'
                      ? '叫分阶段'
                      : game.phase === 'playing'
                        ? '出牌阶段'
                        : '本局结束'}
                </h2>
              </div>
              <div className="actions">
                <button disabled={!game.canStart} onClick={game.startGame}>
                  开始对局
                </button>
                <button className="button-ghost" onClick={game.resetGameBoard}>
                  重置
                </button>
              </div>
            </div>

            <p className="board-message">{game.message || '等待房主开始对局'}</p>

            <div className="table-area">
              <div className="table-slot">
                <p className="panel__label">底牌</p>
                <div className="table-cards">
                  {(game.phase === 'playing' || game.phase === 'finished'
                    ? game.bottomCards
                    : ['XX', 'XX', 'XX']
                  ).map((card, index) => (
                    <div key={`${card}-${index}`} className="table-card-wrap" style={{ animationDelay: `${index * 80}ms` }}>
                      {card === 'XX' ? <div className="card-back" /> : <PlayingCard card={card} compact entering />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="table-slot">
                <p className="panel__label">当前出牌</p>
                <div className="table-cards">
                  {game.lastPlay?.cards?.length ? (
                    game.lastPlay.cards.map((card, index) => (
                      <div key={`${card}-${index}`} className="table-card-wrap" style={{ animationDelay: `${index * 60}ms` }}>
                        <PlayingCard card={card} compact entering />
                      </div>
                    ))
                  ) : (
                    <p className="table-placeholder">等待首家出牌</p>
                  )}
                </div>
              </div>
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

            <div className="actions actions--inline">
              <button
                disabled={game.phase !== 'playing' || game.currentTurn !== connectionStatus.socketId}
                onClick={game.playSelected}
              >
                出牌
              </button>
              <button
                className="button-ghost"
                disabled={game.phase !== 'playing' || game.currentTurn !== connectionStatus.socketId}
                onClick={game.pass}
              >
                不出
              </button>
            </div>
          </article>

          <article className="panel hand-panel">
            <div className="panel__header">
              <div>
                <p className="panel__label">我的手牌</p>
                <h2>{game.myCards.length} 张</h2>
              </div>
            </div>

            <div className="hand-fan">
              {game.myCards.length ? (
                game.myCards.map((card, index) => (
                  <div
                    key={`${card}-${index}`}
                    className="hand-fan__item"
                    style={{
                      transform: `translateX(${index * 34}px) translateY(${game.selectedCards.includes(card) ? -16 : 0}px)`,
                      zIndex: index + 1,
                      animationDelay: `${index * 20}ms`,
                    }}
                  >
                    <PlayingCard
                      card={card}
                      selected={game.selectedCards.includes(card)}
                      entering={game.phase !== 'idle'}
                      disabled={game.phase !== 'playing' || game.currentTurn !== connectionStatus.socketId}
                      onClick={() => game.toggleCard(card)}
                    />
                  </div>
                ))
              ) : (
                <p className="table-placeholder">本局未开始或你已出完手牌</p>
              )}
            </div>
          </article>

          <article className="panel log-panel">
            <div className="panel__header">
              <div>
                <p className="panel__label">实时日志</p>
                <h2>事件流</h2>
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
      </section>
    </main>
  )
}

function navigate(path: '/' | '/game', setPathname: (next: string) => void) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path)
    setPathname(path)
  }
}

export default App
