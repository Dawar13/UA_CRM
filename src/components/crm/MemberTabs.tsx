import { Tabs } from 'radix-ui'
import { cn } from '@/lib/cn'

export interface MemberTabsProps {
  members: readonly { id: string; name: string }[]
  value: string
  onValueChange: (id: string) => void
  className?: string
}

/**
 * The member switch in the header: a segmented control. Each member is a tab; arrow keys move
 * and activate (automatic activation). The selected member is a raised white pill; the others
 * are ghost buttons. Names stand alone, without initials.
 */
export function MemberTabs({ members, value, onValueChange, className }: MemberTabsProps) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={onValueChange}
      activationMode="automatic"
      className={cn('flex items-center', className)}
    >
      <Tabs.List
        aria-label="Team members"
        className="flex items-center gap-0.5 rounded-[8px] bg-surface-hover p-[3px]"
      >
        {members.map((member) => (
          <Tabs.Trigger
            key={member.id}
            value={member.id}
            // Navigation tabs without panels: no aria-controls to a missing element.
            aria-controls={undefined}
            data-testid={`member-tab-${member.id}`}
            className={cn(
              'group/member flex h-7 shrink-0 cursor-default select-none items-center gap-2 rounded-control px-3',
              'text-sm font-medium whitespace-nowrap text-secondary',
              'transition-[background-color,color,box-shadow] duration-(--duration-fast) ease-out',
              'hover:bg-bg/60 hover:text-text',
              'data-[state=active]:bg-bg data-[state=active]:font-semibold data-[state=active]:text-text',
              'data-[state=active]:shadow-[0_1px_2px_var(--shadow),0_0_0_1px_var(--border)]',
            )}
          >
            {member.name}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  )
}
