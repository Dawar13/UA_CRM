import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import type { Member, Sheet } from '@/domain/types'
import { readStorage, storageKeys, writeStorage } from '@/lib/storage'
import { useUiStore } from './uiStore'

export function sheetPath(memberSlug: string, sheetSlug: string, rowId?: string | null): string {
  const base = `/m/${encodeURIComponent(memberSlug)}/${encodeURIComponent(sheetSlug)}`
  return rowId ? `${base}?row=${encodeURIComponent(rowId)}` : base
}

export function memberPath(memberSlug: string): string {
  return `/m/${encodeURIComponent(memberSlug)}`
}

export function rememberLocation(memberId: string, sheetId: string): void {
  writeStorage(storageKeys.lastMember, memberId)
  writeStorage(storageKeys.lastSheet(memberId), sheetId)
}

export function lastMemberId(): string | null {
  return readStorage(storageKeys.lastMember)
}

export function lastSheetId(memberId: string): string | null {
  return readStorage(storageKeys.lastSheet(memberId))
}

/** The member's remembered sheet, or the first. */
export function pickSheet(memberId: string, sheets: readonly Sheet[]): Sheet | undefined {
  const remembered = lastSheetId(memberId)
  return sheets.find((s) => s.id === remembered) ?? sheets[0]
}

/** The remembered member, or the first. */
export function pickMember(members: readonly Member[]): Member | undefined {
  const remembered = lastMemberId()
  return members.find((m) => m.id === remembered) ?? members[0]
}

/** Jumps to a row anywhere (any member, any sheet), expands it and briefly flashes it. */
export function useJumpToRow() {
  const navigate = useNavigate()
  const flashRow = useUiStore((s) => s.flashRow)
  return useCallback(
    (target: { member: Pick<Member, 'slug'>; sheet: Pick<Sheet, 'slug'>; rowId: string }) => {
      flashRow(target.rowId)
      navigate(sheetPath(target.member.slug, target.sheet.slug, target.rowId))
    },
    [navigate, flashRow],
  )
}
