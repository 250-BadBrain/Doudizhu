export type Card = string

export type ComboType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'triple_with_single'
  | 'triple_with_pair'
  | 'straight'
  | 'straight_pairs'
  | 'airplane'
  | 'airplane_with_singles'
  | 'airplane_with_pairs'
  | 'four_with_two'
  | 'four_with_pairs'
  | 'bomb'
  | 'rocket'

export interface Combo {
  type: ComboType
  mainRank: number
  length: number
  cards: Card[]
}

const SUITS = ['S', 'H', 'C', 'D'] as const
const RANK_ORDER = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', 'SJ', 'BJ'] as const

const rankToValue = new Map<string, number>(RANK_ORDER.map((rank, index) => [rank, index + 3]))

const value2 = rankToValue.get('2')!

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

function groupByCount(values: number[]): {
  singles: number[]
  pairs: number[]
  triples: number[]
  quads: number[]
} {
  const freq = new Map<number, number>()
  for (const v of values) {
    freq.set(v, (freq.get(v) ?? 0) + 1)
  }

  const singles: number[] = []
  const pairs: number[] = []
  const triples: number[] = []
  const quads: number[] = []

  for (const [v, c] of freq) {
    if (c === 1) singles.push(v)
    else if (c === 2) pairs.push(v)
    else if (c === 3) triples.push(v)
    else if (c === 4) quads.push(v)
  }

  singles.sort((a, b) => a - b)
  pairs.sort((a, b) => a - b)
  triples.sort((a, b) => a - b)
  quads.sort((a, b) => a - b)

  return { singles, pairs, triples, quads }
}

function isConsecutive(sorted: number[]): boolean {
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false
  }
  return true
}

function noTwoOrJoker(values: number[]): boolean {
  return values.every((v) => v < value2)
}

function isRocket(sorted: Card[]): boolean {
  if (sorted.length !== 2) return false
  const ranks = sorted.map(cardRank)
  return (ranks[0] === 'SJ' && ranks[1] === 'BJ') || (ranks[0] === 'BJ' && ranks[1] === 'SJ')
}

export function parseCombo(cards: Card[]): Combo | null {
  const sorted = sortCards(cards)
  if (sorted.length === 0) return null

  const values = sorted.map(cardValue)
  const { singles, pairs, triples, quads } = groupByCount(values)

  // Rocket
  if (isRocket(sorted)) {
    return { type: 'rocket', mainRank: 99, length: 2, cards: sorted }
  }

  // Bomb: 4 same
  if (quads.length === 1 && cards.length === 4) {
    return { type: 'bomb', mainRank: quads[0], length: 4, cards: sorted }
  }

  // Four with 2 singles
  if (quads.length === 1 && singles.length === 2 && cards.length === 6) {
    return { type: 'four_with_two', mainRank: quads[0], length: 6, cards: sorted }
  }

  // Four with 2 pairs
  if (quads.length === 1 && pairs.length === 2 && cards.length === 8) {
    return { type: 'four_with_pairs', mainRank: quads[0], length: 8, cards: sorted }
  }

  // Single
  if (cards.length === 1) {
    return { type: 'single', mainRank: values[0], length: 1, cards: sorted }
  }

  // Pair
  if (pairs.length === 1 && cards.length === 2) {
    return { type: 'pair', mainRank: pairs[0], length: 2, cards: sorted }
  }

  // Triple
  if (triples.length === 1 && cards.length === 3) {
    return { type: 'triple', mainRank: triples[0], length: 3, cards: sorted }
  }

  // Triple with single
  if (triples.length === 1 && singles.length === 1 && cards.length === 4) {
    return { type: 'triple_with_single', mainRank: triples[0], length: 4, cards: sorted }
  }

  // Triple with pair
  if (triples.length === 1 && pairs.length === 1 && cards.length === 5) {
    return { type: 'triple_with_pair', mainRank: triples[0], length: 5, cards: sorted }
  }

  // Check consecutive-based combos (only if no quads involved)
  if (quads.length === 0) {
    // Airplane: consecutive triples, no kickers
    if (
      triples.length >= 2 &&
      isConsecutive(triples) &&
      noTwoOrJoker(triples) &&
      cards.length === 3 * triples.length
    ) {
      return {
        type: 'airplane',
        mainRank: triples[triples.length - 1],
        length: cards.length,
        cards: sorted,
      }
    }

    // Airplane with singles
    if (
      triples.length >= 2 &&
      isConsecutive(triples) &&
      noTwoOrJoker(triples) &&
      singles.length === triples.length &&
      cards.length === 4 * triples.length
    ) {
      return {
        type: 'airplane_with_singles',
        mainRank: triples[triples.length - 1],
        length: cards.length,
        cards: sorted,
      }
    }

    // Airplane with pairs
    if (
      triples.length >= 2 &&
      isConsecutive(triples) &&
      noTwoOrJoker(triples) &&
      pairs.length === triples.length &&
      cards.length === 5 * triples.length
    ) {
      return {
        type: 'airplane_with_pairs',
        mainRank: triples[triples.length - 1],
        length: cards.length,
        cards: sorted,
      }
    }

    // Straight pairs: consecutive pairs, >= 3
    if (
      pairs.length >= 3 &&
      isConsecutive(pairs) &&
      noTwoOrJoker(pairs) &&
      cards.length === 2 * pairs.length
    ) {
      return {
        type: 'straight_pairs',
        mainRank: pairs[pairs.length - 1],
        length: cards.length,
        cards: sorted,
      }
    }

    // Straight: consecutive singles, >= 5
    if (
      singles.length >= 5 &&
      isConsecutive(singles) &&
      noTwoOrJoker(singles) &&
      cards.length === singles.length
    ) {
      return {
        type: 'straight',
        mainRank: singles[singles.length - 1],
        length: cards.length,
        cards: sorted,
      }
    }
  }

  return null
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
