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
  const { rank, suit, red } = toFace(card)

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
        {rank}
      </span>
      <span className={clsx('playing-card__center', { 'playing-card__center--red': red })}>{suit}</span>
      <span className={clsx('playing-card__corner playing-card__corner--bottom', { 'playing-card__corner--red': red })}>
        {rank}
      </span>
    </button>
  )
}

function toFace(card: Card) {
  if (card === 'SJ') {
    return { rank: 'J', suit: '🃏', red: false }
  }

  if (card === 'BJ') {
    return { rank: 'J', suit: '🃏', red: true }
  }

  const suitCode = card.slice(-1)
  const rank = card.slice(0, -1)

  if (suitCode === 'H') {
    return { rank, suit: '♥', red: true }
  }

  if (suitCode === 'D') {
    return { rank, suit: '♦', red: true }
  }

  if (suitCode === 'S') {
    return { rank, suit: '♠', red: false }
  }

  return { rank, suit: '♣', red: false }
}
