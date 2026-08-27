import EventEmitter from 'events'
import { nanoid } from 'nanoid'

import { LoadGenerator, LoadGeneratorFacts } from '@/types/loadGenerator'

/**
 * A generator that misses three heartbeats is treated as gone. The joiner beats
 * every five seconds, so this tolerates one lost request without flapping.
 */
const OFFLINE_AFTER_MS = 16_000

interface Entry {
  generator: Omit<LoadGenerator, 'status'>
  lastSeen: number
  /** Set by `disconnect`, picked up by the joiner on its next heartbeat. */
  stopping: boolean
}

export class LoadGeneratorPool extends EventEmitter<{ change: [void] }> {
  #entries = new Map<string, Entry>()

  join(facts: LoadGeneratorFacts, ip: string): LoadGenerator {
    const now = Date.now()

    // Rejoining from the same joiner replaces its entry rather than adding a
    // duplicate row. Keyed on the joiner's own id, not the address: two joiners
    // on one machine are two generators, and matching on address would make them
    // evict each other on every rejoin.
    const existing = [...this.#entries.entries()].find(
      ([, entry]) => entry.generator.instance === facts.instance
    )

    if (existing) {
      this.#entries.delete(existing[0])
    }

    const generator = {
      ...facts,
      id: nanoid(8),
      ip,
      clockOffset: Math.round(now / 1000) - facts.clock,
      weight: 1,
    }

    this.#entries.set(generator.id, {
      generator,
      lastSeen: now,
      stopping: false,
    })

    this.emit('change')

    return { ...generator, status: 'ready' }
  }

  /** Returns whether the generator should stop, or null if it is unknown. */
  beat(id: string): { stop: boolean } | null {
    const entry = this.#entries.get(id)

    if (entry === undefined) {
      return null
    }

    const wasOffline = Date.now() - entry.lastSeen > OFFLINE_AFTER_MS

    entry.lastSeen = Date.now()

    if (entry.stopping) {
      this.#entries.delete(id)
      this.emit('change')

      return { stop: true }
    }

    if (wasOffline) {
      this.emit('change')
    }

    return { stop: false }
  }

  /**
   * Weights must stay positive whole numbers — a zero weight would produce an
   * empty execution segment, which k6 rejects.
   */
  setWeight(id: string, weight: number) {
    const entry = this.#entries.get(id)

    if (entry === undefined) {
      return
    }

    entry.generator.weight = Math.min(100, Math.max(1, Math.round(weight)))
    this.emit('change')
  }

  leave(id: string) {
    if (this.#entries.delete(id)) {
      this.emit('change')
    }
  }

  /**
   * Flags the generator so its next heartbeat tells the joiner to exit. The row
   * only disappears once the joiner acknowledges, so the list never claims a
   * machine has stopped while it is still running.
   */
  disconnect(id: string) {
    const entry = this.#entries.get(id)

    if (entry !== undefined) {
      entry.stopping = true
      this.emit('change')
    }
  }

  list(): LoadGenerator[] {
    const now = Date.now()

    return [...this.#entries.values()].map(({ generator, lastSeen }) => ({
      ...generator,
      status: now - lastSeen > OFFLINE_AFTER_MS ? 'offline' : 'ready',
    }))
  }
}

export const pool = new LoadGeneratorPool()
