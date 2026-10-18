import type { TableActionEvent } from '../contracts/types'

export const TABLE_ACTION_CUE_DURATION_MS = 2000

/** Display-only declaration; never sent to the meld animation or network action channel. */
export interface TableDeclarationEvent {
  id: number
  type: 'ready' | 'original-ready'
  actorIndex: number
}

export type TableCueEvent = TableActionEvent | TableDeclarationEvent
