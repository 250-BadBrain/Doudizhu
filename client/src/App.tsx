import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import './App.css'
import { PlayingCard } from './components/PlayingCard'
import { useDoudizhuGame } from './hooks/useDoudizhuGame'
import { useRoomSocket } from './hooks/useRoomSocket'
import { canBeat, parseCombo, sortCards } from './lib/doudizhu'
import { useGameStore } from './store/gameStore'

function App() {
  const [pathname, setPathname] = useState(window.location.pathname)
  const [dealStage, setDealStage] = useState<'idle' | 'dealing' | 'revealed'>('idle')
  const [logExpanded, setLogExpanded] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<{ text: string; kind: 'ok' | 'warn' } | null>(null)
  const {
    connectionStatus,
    nickname,
    roomIdInput,
    currentRoom,
    error,
    logs,
    setNickname,
    setRoomIdInput,
    setCurrentRoom,
    clearError,
  } = useGameStore()

  const currentMe =
    currentRoom?.players.find((player) => player.id === connectionStatus.socketId) ??
    currentRoom?.players.find((player) => player.nickname === nickname) ??
    null
  const actionPlayerId = connectionStatus.socketId
  const seatPlayerId = currentMe?.id ?? connectionStatus.socketId

  const { createRoom, joinRoom, leaveRoom, toggleReady } = useRoomSocket()
  const game = useDoudizhuGame({ room: currentRoom, myId: actionPlayerId })

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

  useEffect(() => {
    if (pathname.startsWith('/game') && !currentRoom) {
      navigate('/', setPathname)
    }
  }, [pathname, currentRoom])

  const inGamePage = pathname.startsWith('/game')
  const canCreate = nickname.trim().length >= 2
  const canJoin = canCreate && roomIdInput.trim().length >= 4
  const me = currentMe

  useEffect(() => {
    if (pathname.startsWith('/game') && currentRoom && !me) {
      setCurrentRoom(null)
      navigate('/', setPathname)
    }
  }, [pathname, currentRoom, me, setCurrentRoom])

  const seatPlayers = useMemo(() => currentRoom?.players ?? [], [currentRoom])
  const myIndex = seatPlayerId ? seatPlayers.findIndex((player) => player.id === seatPlayerId) : -1
  const upperRight =
    myIndex >= 0 && seatPlayers.length >= 2 ? (seatPlayers[(myIndex + 1) % seatPlayers.length] ?? null) : null
  const upperLeft =
    myIndex >= 0 && seatPlayers.length >= 3
      ? (seatPlayers[(myIndex + seatPlayers.length - 1) % seatPlayers.length] ?? null)
      : null

  const viewById = useMemo(() => new Map(game.players.map((player) => [player.id, player])), [game.players])
  const myCardsStacked = useMemo(() => sortCards(game.myCards).reverse(), [game.myCards])

  const showFeedback = (text: string, kind: 'ok' | 'warn' = 'ok') => {
    setActionFeedback({ text, kind })
    window.setTimeout(() => {
      setActionFeedback((current) => (current?.text === text ? null : current))
    }, 1400)
  }

  const handleCreateRoom = () => {
    if (!connectionStatus.connected) {
      showFeedback('未连接服务器，无法创建房间', 'warn')
      return
    }

    if (!canCreate) {
      showFeedback('昵称至少需要 2 个字符', 'warn')
      return
    }

    const result = createRoom()
    if (!result.ok) {
      showFeedback(result.reason ?? '创建房间发送失败', 'warn')
      return
    }

    showFeedback('已发送创建房间请求')
  }

  const handleJoinRoom = () => {
    if (!connectionStatus.connected) {
      showFeedback('未连接服务器，无法加入房间', 'warn')
      return
    }

    if (!canJoin) {
      showFeedback('请填写有效昵称和房间号', 'warn')
      return
    }

    const result = joinRoom()
    if (!result.ok) {
      showFeedback(result.reason ?? '加入房间发送失败', 'warn')
      return
    }

    showFeedback('已发送加入房间请求')
  }

  const handleStartGame = () => {
    if (!currentRoom || !game.canStart) {
      showFeedback('暂不满足开始条件', 'warn')
      return
    }

    const result = game.startGame()
    if (!result.ok) {
      showFeedback(result.reason ?? '开始对局发送失败', 'warn')
      return
    }

    showFeedback('已发送开始对局请求')
  }

  const handleToggleReady = () => {
    if (!currentRoom) {
      showFeedback('当前不在房间内', 'warn')
      return
    }

    const result = toggleReady(!(me?.isReady ?? false))
    if (!result.ok) {
      showFeedback(result.reason ?? '准备状态发送失败', 'warn')
      return
    }

    showFeedback(me?.isReady ? '已发送取消准备请求' : '已发送准备请求')
  }

  const handlePlaySelected = () => {
    if (!currentRoom) {
      showFeedback('当前不在房间内', 'warn')
      return
    }

    if (game.phase !== 'playing' || game.currentTurn !== actionPlayerId) {
      showFeedback('当前不是你的出牌回合', 'warn')
      return
    }

    if (!game.selectedCards.length) {
      showFeedback('请先选择要出的牌', 'warn')
      return
    }

    const nextCombo = parseCombo(game.selectedCards)
    if (!nextCombo) {
      showFeedback('当前选牌不是合法牌型', 'warn')
      return
    }

    if (game.lastPlay?.cards?.length) {
      const currentCombo = parseCombo(game.lastPlay.cards)
      if (currentCombo && !canBeat(nextCombo, currentCombo)) {
        showFeedback('牌型无法压过当前桌面牌', 'warn')
        return
      }
    }

    const result = game.playSelected()
    if (!result.ok) {
      showFeedback(result.reason ?? '出牌发送失败', 'warn')
      return
    }

    showFeedback('已发送出牌请求')
  }

  const handlePass = () => {
    if (!currentRoom) {
      showFeedback('当前不在房间内', 'warn')
      return
    }

    if (game.phase !== 'playing' || game.currentTurn !== actionPlayerId) {
      showFeedback('当前不是你的回合，不能不出', 'warn')
      return
    }

    const result = game.pass()
    if (!result.ok) {
      showFeedback(result.reason ?? '不出发送失败', 'warn')
      return
    }

    showFeedback('已发送不出请求')
  }

  const handleLeaveRoom = () => {
    if (!currentRoom) {
      showFeedback('当前不在房间内', 'warn')
      return
    }

    const result = leaveRoom()
    if (!result.ok) {
      showFeedback(result.reason ?? '离开房间发送失败', 'warn')
      return
    }

    showFeedback('已退出房间')
  }

  const handleCallScore = (score: number) => {
    if (game.phase !== 'bidding' || game.currentTurn !== actionPlayerId) {
      showFeedback('当前不是你的叫分回合', 'warn')
      return
    }

    if (score !== 0 && score < game.currentBid) {
      showFeedback(`叫分必须为 0（不叫）或不低于 ${game.currentBid}`, 'warn')
      return
    }

    const result = game.callScore(score)
    if (!result.ok) {
      showFeedback(result.reason ?? '叫分发送失败', 'warn')
      return
    }

    showFeedback(score === 0 ? '已发送不叫请求' : `已发送叫 ${score} 分请求`)
  }

  const backToHome = () => {
    if (currentRoom) {
      const result = leaveRoom()
      if (!result.ok) {
        showFeedback(result.reason ?? '离开房间发送失败', 'warn')
        return
      }

      showFeedback('已退出房间，返回主页')
    }
    navigate('/', setPathname)
  }

  const dealtAtRef = useRef(game.dealtAt)

  useEffect(() => {
    if (dealtAtRef.current === game.dealtAt) {
      return
    }

    dealtAtRef.current = game.dealtAt

    if (!game.dealtAt) {
      setDealStage('idle') // eslint-disable-line react-hooks/set-state-in-effect
      return
    }

    setDealStage('dealing')
    const timer = window.setTimeout(() => {
      setDealStage('revealed')
    }, 1100)

    return () => window.clearTimeout(timer)
  }, [game.dealtAt])

  if (!inGamePage) {
    return (
      <main className="shell shell--narrow">
        <section className="hero hero--single">
          <div className="hero__content">
            <p className="eyebrow">Doudizhu Online</p>
            <h1>斗地主联机主界面</h1>
            <p className="hero__desc">输入昵称并创建/加入房间，成功后会自动切换到 /game 牌桌页面。</p>
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
              <button disabled={!canCreate || !connectionStatus.connected} onClick={handleCreateRoom}>
                创建房间
              </button>
              <button disabled={!canJoin || !connectionStatus.connected} onClick={handleJoinRoom}>
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
      <section className={clsx('table-shell panel', { 'table-shell--dealing': dealStage === 'dealing' })}>
        <div className="table-status">
          <span>房间：{currentRoom?.roomId ?? '-'}</span>
          <span>阶段：{phaseText(game.phase)}</span>
          <span>当前叫分：{game.currentBid}</span>
        </div>

        {error ? (
          <div className="error-banner" role="alert" onClick={clearError}>
            {error}
          </div>
        ) : null}

        <div className="seat seat--upper-left">
          <OpponentSeat
            player={upperLeft}
            view={upperLeft ? (viewById.get(upperLeft.id) ?? null) : null}
            title="上家"
            dealing={dealStage === 'dealing'}
          />
        </div>
        <div className="seat seat--upper-right">
          <OpponentSeat
            player={upperRight}
            view={upperRight ? (viewById.get(upperRight.id) ?? null) : null}
            title="下家"
            dealing={dealStage === 'dealing'}
          />
        </div>

        <div className="table-bottom-top">
          <p className="panel__label">底牌</p>
          <div className="table-center__cards table-center__cards--top">
            {(game.phase === 'playing' || game.phase === 'finished' ? game.bottomCards : ['XX', 'XX', 'XX']).map(
              (card, index) => (
                <div key={`${game.dealtAt}-bottom-top-${index}-${card}`} className="table-center__card-wrap">
                  {card === 'XX' ? <div className="card-back" /> : <PlayingCard card={card} entering />}
                </div>
              ),
            )}
          </div>
        </div>

        <div className="table-center">
          <p className="table-center__message">{game.message || '等待开始'}</p>

          <div className="table-center__cards">
            {game.lastPlay?.cards?.length ? (
              game.lastPlay.cards.map((card, index) => (
                <div
                  key={`${game.dealtAt}-play-${index}-${card}`}
                  className="table-center__card-wrap"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <PlayingCard card={card} entering />
                </div>
              ))
            ) : (
              <p className="table-placeholder">等待出牌</p>
            )}
          </div>

          <div className="table-center__actions">
            <button disabled={!currentRoom || !game.canStart} onClick={handleStartGame}>
              开始对局
            </button>
            <button className="button-ghost" disabled={!currentRoom} onClick={handleToggleReady}>
              {me?.isReady ? '取消准备' : '准备'}
            </button>
            <button disabled={!currentRoom} onClick={handlePlaySelected}>
              出牌
            </button>
            <button className="button-ghost" disabled={!currentRoom} onClick={handlePass}>
              不出
            </button>
            <button className="button-ghost" disabled={!currentRoom} onClick={handleLeaveRoom}>
              离开房间
            </button>
          </div>

          {game.phase === 'bidding' && game.currentTurn === actionPlayerId ? (
            <div className="table-center__actions bid-actions">
              {[0, 1, 2, 3].map((score) => (
                <button key={score} disabled={score !== 0 && score < game.currentBid} onClick={() => handleCallScore(score)}>
                  {score === 0 ? '不叫' : `叫 ${score} 分`}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button className="button-ghost table-back-home" onClick={backToHome}>
          返回主页
        </button>

        <div className="seat seat--self">
          <div className="self-header">
            <div>
              <p className="panel__label">我的手牌</p>
              <h3>{me?.nickname ?? nickname ?? '我'}</h3>
            </div>
            <span>{game.myCards.length} 张</span>
          </div>

          <div className="self-hand-row">
            {myCardsStacked.length ? (
              myCardsStacked.map((card, index) => (
                <div
                  key={`${game.dealtAt}-self-${index}-${card}`}
                  className={clsx('self-hand-card', { 'self-hand-card--selected': game.selectedCards.includes(card) })}
                  style={{ animationDelay: `${index * 24}ms`, zIndex: index + 1 }}
                >
                  {dealStage === 'dealing' ? (
                    <div className="card-back card-back--hand" />
                  ) : (
                    <PlayingCard
                      card={card}
                      selected={game.selectedCards.includes(card)}
                      entering={game.phase !== 'idle'}
                      disabled={game.phase !== 'playing' || game.currentTurn !== actionPlayerId}
                      onClick={() => game.toggleCard(card)}
                    />
                  )}
                </div>
              ))
            ) : (
              <p className="table-placeholder">本局未开始或你已出完手牌</p>
            )}
          </div>
        </div>
      </section>

      <section className="panel log-panel">
        <div className="panel__header">
          <div>
            <p className="panel__label">实时日志</p>
            <h2>事件流</h2>
          </div>
          <button className="button-ghost log-toggle" onClick={() => setLogExpanded((current) => !current)}>
            {logExpanded ? '收起' : '展开'}
          </button>
        </div>
        {logExpanded ? (
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
        ) : (
          <div className="log-collapsed-hint">已收起，点击“展开”查看详细事件流</div>
        )}
      </section>

      {actionFeedback ? (
        <div
          className={clsx('action-feedback', {
            'action-feedback--warn': actionFeedback.kind === 'warn',
            'action-feedback--ok': actionFeedback.kind === 'ok',
          })}
        >
          {actionFeedback.text}
        </div>
      ) : null}
    </main>
  )
}

function OpponentSeat({
  player,
  view,
  title,
  dealing,
}: {
  player: { id: string; nickname: string } | null
  view: { handCount: number; role: 'landlord' | 'farmer' | null } | null
  title: string
  dealing: boolean
}) {
  if (!player) {
    return (
      <div className="opponent">
        <p className="panel__label">{title}</p>
        <h4>暂无玩家</h4>
      </div>
    )
  }

  return (
    <div className="opponent">
      <p className="panel__label">{title}</p>
      <h4>{player.nickname}</h4>
      <p className="opponent__meta">{view?.role ? (view.role === 'landlord' ? '地主' : '农民') : '未分配角色'}</p>
      <div className="opponent__cards">
        {Array.from({ length: Math.min(view?.handCount ?? 0, 17) }).map((_, index, list) => (
          <span
            key={`${player.id}-${index}`}
            className={clsx('card-back card-back--mini opponent__card-slot', {
              'card-back--dealing': dealing,
              'opponent__card-slot--tail': index === list.length - 1,
            })}
            style={{ animationDelay: `${index * 22}ms` }}
          />
        ))}
      </div>
      <p className="opponent__count">{view?.handCount ?? 0} 张</p>
    </div>
  )
}

function phaseText(phase: string) {
  if (phase === 'bidding') {
    return '叫分阶段'
  }
  if (phase === 'playing') {
    return '出牌阶段'
  }
  if (phase === 'finished') {
    return '已结束'
  }
  return '待开始'
}

function navigate(path: '/' | '/game', setPathname: (next: string) => void) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path)
    setPathname(path)
  }
}

export default App
