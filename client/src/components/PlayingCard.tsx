import { clsx } from 'clsx'
import type { Card } from '../lib/doudizhu'

interface PlayingCardProps {
  card: Card
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  compact?: boolean
  entering?: boolean
}

export function PlayingCard({
  card,
  selected = false,
  disabled = false,
  onClick,
  compact = false,
  entering = false,
}: PlayingCardProps) {
  const { rank, suit, red, isJoker } = toFace(card)
  const pips = buildCenterPips(rank, suit, isJoker)

  return (
    <button
      className={clsx('playing-card', {
        'playing-card--selected': selected,
        'playing-card--compact': compact,
        'playing-card--entering': entering,
      })}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className={clsx('playing-card__corner', { 'playing-card__corner--red': red })}>
        <em>{rank}</em>
        <small>{suit}</small>
      </span>
      <span
        className={clsx('playing-card__center', {
          'playing-card__center--red': red,
          'playing-card__center--face': pips.length === 1,
        })}
      >
        {pips.map((item, index) => (
          <i
            key={`${item.symbol}-${item.position}-${index}`}
            className={clsx('playing-card__pip', `playing-card__pip--${item.position}`, {
              'playing-card__pip--flip': item.flip,
            })}
          >
            {item.symbol}
          </i>
        ))}
      </span>
      <span className={clsx('playing-card__corner playing-card__corner--bottom', { 'playing-card__corner--red': red })}>
        <em>{rank}</em>
        <small>{suit}</small>
      </span>
    </button>
  )
}

function toFace(card: Card) {
  if (card === 'SJ') {
    return { rank: 'JOKER', suit: '🃏', red: false, isJoker: true }
  }

  if (card === 'BJ') {
    return { rank: 'JOKER', suit: '🃏', red: true, isJoker: true }
  }

  const suitCode = card.slice(-1)
  const rank = card.slice(0, -1)

  if (suitCode === 'H') {
    return { rank, suit: '♥', red: true, isJoker: false }
  }

  if (suitCode === 'D') {
    return { rank, suit: '♦', red: true, isJoker: false }
  }

  if (suitCode === 'S') {
    return { rank, suit: '♠', red: false, isJoker: false }
  }

  return { rank, suit: '♣', red: false, isJoker: false }
}

type PipPosition =
  | 'tml'
  | 'tmr'
  | 'tc'
  | 'mc'
  | 'bc'
  | 'tl'
  | 'tr'
  | 'ml'
  | 'mr'
  | 'bml'
  | 'bmr'
  | 'bl'
  | 'br'

interface PipSpec {
  symbol: string
  position: PipPosition
  flip?: boolean
}

function buildCenterPips(rank: string, suit: string, isJoker: boolean): PipSpec[] {
  if (isJoker) {
    return [{ symbol: suit, position: 'mc' }]
  }

  if (rank === 'A') {
    return [{ symbol: suit, position: 'mc' }]
  }

  if (rank === 'J' || rank === 'Q' || rank === 'K') {
    return [{ symbol: `${rank}${suit}`, position: 'mc' }]
  }

  const value = Number(rank)
  if (!Number.isFinite(value) || value < 2 || value > 10) {
    return [{ symbol: suit, position: 'mc' }]
  }

  const layout = pipLayouts[value] ?? ['mc']
  return layout.map((position) => ({
    symbol: suit,
    position,
    flip: position.startsWith('b'),
  }))
}

const pipLayouts: Record<number, PipPosition[]> = {
  2: ['tc', 'bc'],
  3: ['tc', 'mc', 'bc'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'mc', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
  7: ['tl', 'tr', 'tc', 'ml', 'mr', 'bl', 'br'],
  8: ['tl', 'tr', 'tc', 'ml', 'mr', 'bc', 'bl', 'br'],
  9: ['tl', 'tr', 'tc', 'ml', 'mc', 'mr', 'bc', 'bl', 'br'],
  10: ['tl', 'tml', 'tmr', 'tr', 'ml', 'mr', 'bl', 'bml', 'bmr', 'br'],
}
