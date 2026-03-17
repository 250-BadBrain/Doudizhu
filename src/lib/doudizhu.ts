export type Card = string

export type ComboType = 'single' | 'pair' | 'triple' | 'bomb' | 'rocket' | 'straight'

export interface Combo {
  type: ComboType
  mainRank: number
  length: number
  cards: Card[]
}

const SUITS = ['S', 'H', 'C', 'D'] as const
const RANK_ORDER = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', 'SJ', 'BJ'] as const

const rankToValue = new Map<string, number>(RANK_ORDER.map((rank, index) => [rank, index + 3]))

export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const rank of RANK_ORDER) {
    if (rank === 'SJ' || rank === 'BJ') {
      deck.push(rank)
      continue
    }

    for (const suit of SUITS) {
      deck.push(`${rank}${suit}`)
    }
  }

  return deck
}

export function shuffle<T>(items: T[]): T[] {
  const list = [...items]
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const temp = list[index]
    list[index] = list[swapIndex]
    list[swapIndex] = temp
  }
  return list
}

export function cardRank(card: Card): string {
  if (card === 'SJ' || card === 'BJ') {
    return card
  }

  return card.slice(0, -1)
}

export function cardValue(card: Card): number {
  const rank = cardRank(card)
  const value = rankToValue.get(rank)
  if (!value) {
    throw new Error(`Unknown card rank: ${rank}`)
  }
  return value
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((left, right) => cardValue(left) - cardValue(right))
}

export function parseCombo(cards: Card[]): Combo | null {
  const sorted = sortCards(cards)
  if (sorted.length === 0) {
    return null
  }

  const values = sorted.map(cardValue)
  const counts = new Map<number, number>()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  if (sorted.length === 1) {
    return { type: 'single', mainRank: values[0], length: 1, cards: sorted }
  }

  if (sorted.length === 2) {
    const rankA = cardRank(sorted[0])
    const rankB = cardRank(sorted[1])
    if ((rankA === 'SJ' && rankB === 'BJ') || (rankA === 'BJ' && rankB === 'SJ')) {
      return { type: 'rocket', mainRank: 99, length: 2, cards: sorted }
    }

    if (counts.size === 1) {
      return { type: 'pair', mainRank: values[0], length: 2, cards: sorted }
    }

    return null
  }

  if (sorted.length === 3 && counts.size === 1) {
    return { type: 'triple', mainRank: values[0], length: 3, cards: sorted }
  }

  if (sorted.length === 4 && counts.size === 1) {
    return { type: 'bomb', mainRank: values[0], length: 4, cards: sorted }
  }

  if (sorted.length >= 5 && isStraight(values, counts)) {
    return {
      type: 'straight',
      mainRank: values[values.length - 1],
      length: values.length,
      cards: sorted,
    }
  }

  return null
}

function isStraight(values: number[], counts: Map<number, number>): boolean {
  if (counts.size !== values.length) {
    return false
  }

  const maxValue = values[values.length - 1]
  const minValue = values[0]

  if (maxValue >= rankToValue.get('2')!) {
    return false
  }

  return maxValue - minValue + 1 === values.length
}

export function canBeat(next: Combo, current: Combo | null): boolean {
  if (!current) {
    return true
  }

  if (next.type === 'rocket') {
    return true
  }

  if (current.type === 'rocket') {
    return false
  }

  if (next.type === 'bomb' && current.type !== 'bomb') {
    return true
  }

  if (next.type !== current.type) {
    return false
  }

  if (next.length !== current.length) {
    return false
  }

  return next.mainRank > current.mainRank
}

export function removeCards(from: Card[], toRemove: Card[]): Card[] {
  const next = [...from]
  for (const card of toRemove) {
    const index = next.indexOf(card)
    if (index === -1) {
      throw new Error('Card not found in hand')
    }
    next.splice(index, 1)
  }
  return next
}
