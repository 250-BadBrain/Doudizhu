import { useMemo, useState } from 'react'
import {
  buildDeck,
  canBeat,
  type Card,
  cardValue,
  parseCombo,
  removeCards,
  shuffle,
  sortCards,
  type Combo,
} from '../lib/doudizhu'
import type { RoomSnapshot } from '../types/game'

interface GamePlayer {
  id: string
  nickname: string
  hand: Card[]
  role: 'landlord' | 'farmer'
}

interface LastPlay {
  playerId: string
  cards: Card[]
  combo: Combo
}

type Phase = 'idle' | 'bidding' | 'playing' | 'finished'

interface UseDoudizhuGameParams {
  room: RoomSnapshot | null
  myId: string | null
}

function seatOrder(room: RoomSnapshot): Array<{ id: string; nickname: string }> {
  return [...room.players]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((player) => ({ id: player.id, nickname: player.nickname }))
}

function pickBid(currentBid: number): number {
  const roll = Math.random()
  if (currentBid >= 3) {
    return 0
  }

  if (roll > 0.8) {
    return Math.min(3, currentBid + 1)
  }

  if (roll > 0.5) {
    return currentBid
  }

  return 0
}

export function useDoudizhuGame({ room, myId }: UseDoudizhuGameParams) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [players, setPlayers] = useState<GamePlayer[]>([])
  const [bottomCards, setBottomCards] = useState<Card[]>([])
  const [currentTurn, setCurrentTurn] = useState<string | null>(null)
  const [currentBid, setCurrentBid] = useState(0)
  const [biddingStarter, setBiddingStarter] = useState<string | null>(null)
  const [lastPlay, setLastPlay] = useState<LastPlay | null>(null)
  const [passCount, setPassCount] = useState(0)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [selectedCards, setSelectedCards] = useState<Card[]>([])
  const [message, setMessage] = useState('')

  const myPlayer = useMemo(() => players.find((player) => player.id === myId) ?? null, [players, myId])

  const canStart = Boolean(room && room.players.length === 3 && room.status === 'ready' && myId === room.hostId)

  function startGame() {
    if (!room || !myId) {
      return
    }

    if (!canStart) {
      setMessage('仅房主可在三人准备后开始对局')
      return
    }

    const seats = seatOrder(room)
    const allCards = shuffle(buildDeck())
    const nextPlayers: GamePlayer[] = seats.map((player, index) => ({
      id: player.id,
      nickname: player.nickname,
      hand: sortCards(allCards.slice(index * 17, index * 17 + 17)),
      role: 'farmer',
    }))

    const kitty = sortCards(allCards.slice(51))

    const starter = seats[0].id
    setPlayers(nextPlayers)
    setBottomCards(kitty)
    setPhase('bidding')
    setCurrentTurn(starter)
    setBiddingStarter(starter)
    setCurrentBid(0)
    setLastPlay(null)
    setPassCount(0)
    setWinnerId(null)
    setSelectedCards([])
    setMessage('对局开始，请叫分（0-3 分）')

    maybeAutoBid(nextPlayers, starter, 0, starter, kitty)
  }

  function callScore(score: number) {
    if (phase !== 'bidding' || !myId || currentTurn !== myId) {
      return
    }

    if (score < currentBid || score > 3) {
      setMessage(`叫分必须在 ${currentBid} 到 3 之间`)
      return
    }

    proceedBid(myId, score)
  }

  function proceedBid(playerId: string, score: number) {
    if (!biddingStarter) {
      return
    }

    const nextBid = Math.max(currentBid, score)
    const nextStarter = score > currentBid ? playerId : biddingStarter

    setCurrentBid(nextBid)
    setBiddingStarter(nextStarter)

    const currentIndex = players.findIndex((player) => player.id === playerId)
    const nextIndex = (currentIndex + 1) % players.length
    const nextPlayer = players[nextIndex]

    const shouldEnd = nextPlayer.id === biddingStarter || nextBid === 3
    if (shouldEnd) {
      const landlordId = nextBid === 0 ? playerId : nextStarter
      const nextPlayers = players.map((player) => {
        if (player.id !== landlordId) {
          return { ...player, role: 'farmer' as const }
        }

        return {
          ...player,
          role: 'landlord' as const,
          hand: sortCards([...player.hand, ...bottomCards]),
        }
      })

      setPlayers(nextPlayers)
      setPhase('playing')
      setCurrentTurn(landlordId)
      setMessage(`地主已确定：${nicknameOf(landlordId, nextPlayers)}，请出牌`)
      maybeAutoPlay(nextPlayers, landlordId, null, 0)
      return
    }

    setCurrentTurn(nextPlayer.id)
    setMessage(`${nicknameOf(playerId, players)} 叫分 ${score}，轮到 ${nicknameOf(nextPlayer.id, players)}`)
    maybeAutoBid(players, nextPlayer.id, nextBid, nextStarter, bottomCards)
  }

  function maybeAutoBid(currentPlayers: GamePlayer[], turnId: string, bid: number, starter: string, kitty: Card[]) {
    if (!myId || turnId === myId) {
      return
    }

    window.setTimeout(() => {
      const botScore = pickBid(bid)
      setPlayers(currentPlayers)
      setCurrentBid(bid)
      setBiddingStarter(starter)
      setBottomCards(kitty)
      setCurrentTurn(turnId)
      proceedBid(turnId, botScore)
    }, 680)
  }

  function toggleCard(card: Card) {
    if (phase !== 'playing' || !myId || currentTurn !== myId) {
      return
    }

    setSelectedCards((current) =>
      current.includes(card) ? current.filter((item) => item !== card) : sortCards([...current, card]),
    )
  }

  function playSelected() {
    if (!myId || currentTurn !== myId || phase !== 'playing') {
      return
    }

    const combo = parseCombo(selectedCards)
    if (!combo) {
      setMessage('当前选牌不是合法牌型')
      return
    }

    if (!canBeat(combo, lastPlay?.combo ?? null)) {
      setMessage('牌型无法压过当前桌面牌')
      return
    }

    applyPlay(myId, selectedCards, combo)
    setSelectedCards([])
  }

  function pass() {
    if (!myId || currentTurn !== myId || phase !== 'playing') {
      return
    }

    if (!lastPlay) {
      setMessage('首出不能过牌')
      return
    }

    const nextPassCount = passCount + 1
    const index = players.findIndex((player) => player.id === myId)
    const nextPlayer = players[(index + 1) % players.length]

    if (nextPassCount >= 2) {
      setLastPlay(null)
      setPassCount(0)
      setCurrentTurn(lastPlay.playerId)
      setMessage('其余两家已过牌，出牌权回到上轮赢家')
      maybeAutoPlay(players, lastPlay.playerId, null, 0)
      return
    }

    setPassCount(nextPassCount)
    setCurrentTurn(nextPlayer.id)
    setMessage(`${nicknameOf(myId, players)} 选择不出`)
    maybeAutoPlay(players, nextPlayer.id, lastPlay, nextPassCount)
  }

  function applyPlay(playerId: string, cards: Card[], combo: Combo) {
    const nextPlayers = players.map((player) => {
      if (player.id !== playerId) {
        return player
      }

      return {
        ...player,
        hand: sortCards(removeCards(player.hand, cards)),
      }
    })

    const playedBy = nextPlayers.find((player) => player.id === playerId)
    if (playedBy && playedBy.hand.length === 0) {
      setPlayers(nextPlayers)
      setWinnerId(playerId)
      setPhase('finished')
      setLastPlay({ playerId, cards, combo })
      setCurrentTurn(null)
      setMessage(`${playedBy.nickname} 获胜，本局结束`) 
      return
    }

    const index = nextPlayers.findIndex((player) => player.id === playerId)
    const nextPlayer = nextPlayers[(index + 1) % nextPlayers.length]

    const nextLastPlay: LastPlay = { playerId, cards: sortCards(cards), combo }
    setPlayers(nextPlayers)
    setLastPlay(nextLastPlay)
    setPassCount(0)
    setCurrentTurn(nextPlayer.id)
    setMessage(`${nicknameOf(playerId, nextPlayers)} 出牌：${cards.map(cardLabel).join(' ')}`)
    maybeAutoPlay(nextPlayers, nextPlayer.id, nextLastPlay, 0)
  }

  function maybeAutoPlay(currentPlayers: GamePlayer[], turnId: string, board: LastPlay | null, currentPassCount: number) {
    if (!myId || phase !== 'playing' || turnId === myId) {
      return
    }

    window.setTimeout(() => {
      const player = currentPlayers.find((item) => item.id === turnId)
      if (!player) {
        return
      }

      const move = chooseBotMove(player.hand, board?.combo ?? null)
      if (!move) {
        if (!board) {
          const firstCard = sortCards(player.hand)[0]
          const combo = parseCombo([firstCard])
          if (!combo) {
            return
          }
          setPlayers(currentPlayers)
          setPassCount(currentPassCount)
          applyPlay(turnId, [firstCard], combo)
          return
        }

        setPlayers(currentPlayers)
        setPassCount(currentPassCount)
        setCurrentTurn(turnId)
        passAsBot(turnId)
        return
      }

      setPlayers(currentPlayers)
      setPassCount(currentPassCount)
      setCurrentTurn(turnId)
      applyPlay(turnId, move.cards, move.combo)
    }, 740)
  }

  function passAsBot(playerId: string) {
    if (!lastPlay) {
      return
    }

    const nextPassCount = passCount + 1
    const index = players.findIndex((player) => player.id === playerId)
    const nextPlayer = players[(index + 1) % players.length]

    if (nextPassCount >= 2) {
      setLastPlay(null)
      setPassCount(0)
      setCurrentTurn(lastPlay.playerId)
      setMessage('其余两家已过牌，出牌权回到上轮赢家')
      maybeAutoPlay(players, lastPlay.playerId, null, 0)
      return
    }

    setPassCount(nextPassCount)
    setCurrentTurn(nextPlayer.id)
    setMessage(`${nicknameOf(playerId, players)} 选择不出`)
    maybeAutoPlay(players, nextPlayer.id, lastPlay, nextPassCount)
  }

  function resetGameBoard() {
    setPhase('idle')
    setPlayers([])
    setBottomCards([])
    setCurrentTurn(null)
    setCurrentBid(0)
    setBiddingStarter(null)
    setLastPlay(null)
    setPassCount(0)
    setWinnerId(null)
    setSelectedCards([])
    setMessage('')
  }

  const myCards = myPlayer?.hand ?? []

  return {
    phase,
    players,
    bottomCards,
    currentTurn,
    currentBid,
    lastPlay,
    passCount,
    winnerId,
    selectedCards,
    myCards,
    message,
    canStart,
    startGame,
    callScore,
    toggleCard,
    playSelected,
    pass,
    resetGameBoard,
  }
}

function chooseBotMove(hand: Card[], boardCombo: Combo | null): { cards: Card[]; combo: Combo } | null {
  const sorted = sortCards(hand)

  if (!boardCombo) {
    const single = [sorted[0]]
    const combo = parseCombo(single)
    return combo ? { cards: single, combo } : null
  }

  const candidates: Card[][] = []

  for (const card of sorted) {
    candidates.push([card])
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    if (cardValue(sorted[index]) === cardValue(sorted[index + 1])) {
      candidates.push([sorted[index], sorted[index + 1]])
    }
  }

  for (let index = 0; index < sorted.length - 2; index += 1) {
    if (cardValue(sorted[index]) === cardValue(sorted[index + 2])) {
      candidates.push([sorted[index], sorted[index + 1], sorted[index + 2]])
    }
  }

  for (let index = 0; index < sorted.length - 3; index += 1) {
    if (cardValue(sorted[index]) === cardValue(sorted[index + 3])) {
      candidates.push([sorted[index], sorted[index + 1], sorted[index + 2], sorted[index + 3]])
    }
  }

  if (hand.includes('SJ') && hand.includes('BJ')) {
    candidates.push(['SJ', 'BJ'])
  }

  for (const cards of candidates) {
    const combo = parseCombo(cards)
    if (!combo) {
      continue
    }

    if (canBeat(combo, boardCombo)) {
      return { cards, combo }
    }
  }

  return null
}

function nicknameOf(playerId: string, players: GamePlayer[]): string {
  return players.find((player) => player.id === playerId)?.nickname ?? '玩家'
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
