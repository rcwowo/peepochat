import * as React from "react"

import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type MenuPanelKind = "context" | "dropdown"

const MenuPanelKindContext = React.createContext<MenuPanelKind>("context")

export function MenuPanelProvider({
  kind,
  children,
}: {
  kind: MenuPanelKind
  children: React.ReactNode
}) {
  return <MenuPanelKindContext value={kind}>{children}</MenuPanelKindContext>
}

function useMenuPanelKind() {
  return React.useContext(MenuPanelKindContext)
}

export function menuPanelContentClassName(className?: string) {
  return cn("w-48", className)
}

export function MenuPanelSeparator() {
  const kind = useMenuPanelKind()

  if (kind === "context") {
    return <ContextMenuSeparator />
  }

  return <DropdownMenuSeparator />
}

export function MenuPanelCheckboxGroup({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="flex flex-col">{children}</div>
}

export function MenuPanelItem({
  icon: Icon,
  label,
  disabled,
  variant = "default",
  onSelect,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: React.ReactNode
  disabled?: boolean
  variant?: "default" | "destructive"
  onSelect?: () => void
}) {
  const kind = useMenuPanelKind()
  const destructiveClassName =
    variant === "destructive"
      ? "!text-destructive focus:!text-destructive data-[highlighted]:!text-destructive [&_svg]:!text-destructive"
      : undefined
  const content = (
    <>
      {Icon ? <Icon className="size-4 shrink-0" /> : null}
      <span className="min-w-0 truncate">{label}</span>
    </>
  )

  if (kind === "context") {
    return (
      <ContextMenuItem
        disabled={disabled}
        variant={variant}
        onSelect={onSelect}
        className={destructiveClassName}
      >
        {content}
      </ContextMenuItem>
    )
  }

  return (
    <DropdownMenuItem
      disabled={disabled}
      variant={variant}
      onSelect={onSelect}
      className={destructiveClassName}
    >
      {content}
    </DropdownMenuItem>
  )
}

export type MenuPanelAction = {
  icon: React.ComponentType<{ className?: string }>
  label: string
  disabled?: boolean
  onSelect?: () => void
}

export function MenuPanelActions({ actions }: { actions: MenuPanelAction[] }) {
  if (actions.length === 0) {
    return null
  }

  if (actions.length === 1) {
    const action = actions[0]
    return (
      <MenuPanelItem
        icon={action.icon}
        label={action.label}
        disabled={action.disabled}
        onSelect={action.onSelect}
      />
    )
  }

  return (
    <MenuActionGrid>
      {actions.map((action) => (
        <MenuActionGridItem
          key={action.label}
          icon={action.icon}
          label={action.label}
          disabled={action.disabled}
          onSelect={action.onSelect}
        />
      ))}
    </MenuActionGrid>
  )
}

function MenuActionGrid({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-1">{children}</div>
}

function MenuActionGridItem({
  icon: Icon,
  label,
  disabled,
  onSelect,
}: MenuPanelAction) {
  const kind = useMenuPanelKind()
  const className = cn(
    "flex flex-1 flex-col items-center justify-center gap-1.5 py-2.5 text-xs",
    disabled && "text-muted-foreground opacity-50"
  )
  const content = (
    <>
      <Icon className="size-5 shrink-0" />
      <span>{label}</span>
    </>
  )

  if (kind === "context") {
    return (
      <ContextMenuItem
        disabled={disabled}
        onSelect={onSelect}
        className={className}
      >
        {content}
      </ContextMenuItem>
    )
  }

  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={onSelect}
      className={className}
    >
      {content}
    </DropdownMenuItem>
  )
}

export function MenuPanelCheckboxItem({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children: React.ReactNode
}) {
  const kind = useMenuPanelKind()
  const className = "pr-1.5 pl-1.5 [&>span:first-child]:hidden"
  const content = (
    <>
      <Checkbox
        checked={checked}
        tabIndex={-1}
        className="pointer-events-none"
      />
      {children}
    </>
  )

  if (kind === "context") {
    return (
      <ContextMenuCheckboxItem
        checked={checked}
        onCheckedChange={onCheckedChange}
        className={className}
      >
        {content}
      </ContextMenuCheckboxItem>
    )
  }

  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={className}
    >
      {content}
    </DropdownMenuCheckboxItem>
  )
}
