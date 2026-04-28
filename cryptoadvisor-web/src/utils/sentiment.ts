/**
 * VADER-lite sentiment classifier for crypto/finance text (STORY-1203).
 *
 * Pure-JS, no external NLP API, no model download. Built-in lexicon of
 * ~280 finance/crypto-relevant tokens with valences in [-4, +4]. Handles
 * negation ("not bullish") and intensifiers ("very bullish") via small
 * windowed rules. Output is a normalized polarity score in [-1, +1].
 *
 * Honest scope notes:
 *   - This is a rule-based classifier; modern LLM-based sentiment is more
 *     accurate but requires a paid/proprietary API. The lexicon was
 *     curated for FUD/moon/hodl/rugged-style crypto chatter and is
 *     intentionally domain-specific.
 *   - For paragraph-length text use `scoreText`; for batches of social
 *     posts call `scoreText` on each title and aggregate.
 */

const LEXICON: Record<string, number> = {
  // Strong positives
  bullish: 3,
  moon: 3,
  mooning: 3,
  pump: 2,
  pumping: 2,
  rally: 2,
  rallies: 2,
  surge: 2,
  surging: 2,
  breakout: 2,
  breakouts: 2,
  ath: 3,
  // 'all-time-high' handled via bigram below
  rocket: 3,
  hodl: 1,
  diamond: 2,
  buying: 1,
  bought: 1,
  long: 1,
  longing: 1,
  accumulate: 2,
  accumulating: 2,
  accumulation: 2,
  green: 2,
  gains: 2,
  gain: 1,
  win: 2,
  winning: 2,
  profit: 2,
  profits: 2,
  profitable: 2,
  rich: 2,
  wealth: 2,
  bull: 2,
  rise: 1,
  rising: 2,
  rose: 1,
  upside: 2,
  upward: 2,
  strong: 2,
  stronger: 2,
  strongest: 3,
  optimistic: 3,
  optimism: 3,
  confident: 2,
  confidence: 2,
  excellent: 3,
  great: 2,
  good: 1,
  positive: 2,
  legendary: 3,
  godcandle: 4,
  fomo: 1,
  send: 1,
  sending: 1,
  sent: 1,
  parabolic: 3,
  vertical: 2,
  ramp: 2,
  ramping: 2,
  golden: 2,
  // Neutral-ish but slightly positive
  hold: 1,
  holding: 1,

  // Strong negatives
  bearish: -3,
  dump: -2,
  dumping: -2,
  crash: -3,
  crashing: -3,
  crashed: -3,
  collapse: -3,
  collapsing: -3,
  collapsed: -3,
  rugged: -4,
  rugpull: -4,
  scam: -3,
  scammer: -3,
  scammers: -3,
  fraud: -3,
  hack: -3,
  hacked: -3,
  hacker: -2,
  exploit: -3,
  exploited: -3,
  ponzi: -4,
  fud: -2,
  panic: -3,
  panicking: -3,
  fear: -2,
  fearful: -2,
  fearing: -2,
  red: -2,
  loss: -2,
  losing: -2,
  losses: -2,
  lost: -2,
  bear: -2,
  drop: -1,
  dropping: -2,
  dropped: -2,
  decline: -2,
  declining: -2,
  declined: -2,
  fall: -2,
  falling: -2,
  fell: -2,
  bleed: -2,
  bleeding: -2,
  capitulation: -3,
  capitulate: -3,
  pessimistic: -3,
  pessimism: -3,
  weak: -2,
  weaker: -2,
  weakest: -3,
  bad: -2,
  worst: -3,
  terrible: -3,
  awful: -3,
  poor: -2,
  negative: -2,
  liquidated: -3,
  liquidation: -3,
  rekt: -3,
  bagholder: -2,
  exit: -1,
  selloff: -3,
  sell: -1,
  selling: -1,
  sold: -1,
  short: -1,
  shorting: -2,
  bottom: -1,
  bottomed: 0,
  // Hot-button regulatory / negative news triggers
  ban: -2,
  banned: -2,
  banning: -2,
  sanctions: -2,
  lawsuit: -2,
  sued: -2,
  fined: -2,
  fine: -1,
  sec: -1,
  delisting: -2,
  delisted: -2,
  bankruptcy: -3,
  bankrupt: -3,
  insolvent: -3,
  insolvency: -3,
  freeze: -2,
  frozen: -2,
}

const NEGATORS = new Set([
  'not',
  "n't",
  'no',
  'never',
  'none',
  'cannot',
  "can't",
  'without',
  'isnt',
  "isn't",
  'arent',
  "aren't",
  'wasnt',
  "wasn't",
  'wont',
  "won't",
  'havent',
  "haven't",
  'hardly',
  'barely',
])

const INTENSIFIERS: Record<string, number> = {
  very: 1.5,
  extremely: 2,
  super: 1.5,
  really: 1.3,
  totally: 1.5,
  absolutely: 1.6,
  insanely: 2,
  massively: 1.7,
  huge: 1.4,
  massive: 1.5,
  major: 1.3,
  fucking: 1.6,
  fkn: 1.6,
}

const BIGRAMS: Record<string, number> = {
  'all time high': 3,
  'all-time high': 3,
  'all-time-high': 3,
  'new high': 2,
  'new low': -2,
  'going to zero': -4,
  'to the moon': 4,
  'paper hands': -2,
  'diamond hands': 3,
  'going up': 2,
  'going down': -2,
  'short squeeze': 3,
  'long squeeze': -3,
  'pump and dump': -3,
  'death cross': -3,
  'golden cross': 3,
}

export interface SentimentScore {
  /** Sum of token valences with negation/intensifier adjustments. */
  raw: number
  /** Normalized to [-1, +1] via x / (|x| + 4). */
  polarity: number
  /** Hits — list of matched tokens for debugging. */
  hits: Array<{ token: string; score: number }>
  /** 'positive' | 'negative' | 'neutral' label. */
  label: 'positive' | 'negative' | 'neutral'
}

export function scoreText(text: string): SentimentScore {
  if (!text) return { raw: 0, polarity: 0, hits: [], label: 'neutral' }
  const lower = text.toLowerCase()

  // Bigrams first (longer matches win)
  let raw = 0
  const hits: Array<{ token: string; score: number }> = []
  for (const [phrase, score] of Object.entries(BIGRAMS)) {
    if (lower.includes(phrase)) {
      raw += score
      hits.push({ token: phrase, score })
    }
  }

  const tokens = lower.split(/[^a-z']+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    const base = LEXICON[tok]
    if (base === undefined) continue

    let score = base
    // Look back up to 2 words for negation or intensifier
    for (let lookback = 1; lookback <= 2; lookback++) {
      const j = i - lookback
      if (j < 0) break
      const prev = tokens[j]
      if (NEGATORS.has(prev)) {
        score = -score * 0.85
        break
      }
      if (INTENSIFIERS[prev]) {
        score = score * INTENSIFIERS[prev]
        break
      }
    }
    raw += score
    hits.push({ token: tok, score })
  }

  // VADER-style normalization
  const polarity = raw / (Math.abs(raw) + 4)
  const label: SentimentScore['label'] =
    polarity > 0.1 ? 'positive' : polarity < -0.1 ? 'negative' : 'neutral'
  return { raw, polarity, hits, label }
}

/**
 * Aggregate sentiment over a batch of texts, weighted by an optional
 * importance factor (e.g. Reddit upvotes). Returns the weighted-average
 * polarity in [-1, +1].
 */
export function aggregateSentiment(
  items: Array<{ text: string; weight?: number }>,
): { polarity: number; positive: number; negative: number; neutral: number; count: number } {
  let totalWeight = 0
  let weighted = 0
  let pos = 0
  let neg = 0
  let neu = 0
  for (const it of items) {
    const score = scoreText(it.text)
    const w = it.weight && it.weight > 0 ? it.weight : 1
    totalWeight += w
    weighted += score.polarity * w
    if (score.label === 'positive') pos++
    else if (score.label === 'negative') neg++
    else neu++
  }
  return {
    polarity: totalWeight === 0 ? 0 : weighted / totalWeight,
    positive: pos,
    negative: neg,
    neutral: neu,
    count: items.length,
  }
}
