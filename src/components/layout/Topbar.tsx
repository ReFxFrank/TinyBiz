import { useNavigate } from 'react-router-dom'
import { Menu as MenuIcon, Moon, Monitor, Plus, Search, Sun } from 'lucide-react'
import { useUI, type Theme } from '@/store/useUI'
import { useStore } from '@/store/useStore'
import { Button, IconButton } from '@/components/ui/Button'
import { Menu, MenuItem, MenuLabel } from '@/components/ui/Menu'
import { Avatar, Kbd } from '@/components/ui/Misc'
import { NotificationsPanel } from './NotificationsPanel'

const themeIcons: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor }

export function Topbar() {
  const setMobileNav = useUI((s) => s.setMobileNav)
  const setPalette = useUI((s) => s.setPalette)
  const theme = useUI((s) => s.theme)
  const setTheme = useUI((s) => s.setTheme)
  const settings = useStore((s) => s.settings)
  const navigate = useNavigate()
  const ThemeIcon = themeIcons[theme]

  return (
    <header className="glass sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-edge px-4 sm:px-6">
      <IconButton label="Open navigation" className="lg:hidden" onClick={() => setMobileNav(true)}>
        <MenuIcon />
      </IconButton>

      <button
        onClick={() => setPalette(true)}
        className="flex h-9 w-full max-w-xs items-center gap-2.5 rounded-xl border border-edge bg-surface px-3 text-sm text-ink-3 transition-colors hover:border-accent/40 hover:text-ink-2"
        aria-label="Search (Command+K)"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">Search anything…</span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <Menu
          align="end"
          trigger={
            <Button size="sm" icon={<Plus />} className="hidden sm:inline-flex">
              New
            </Button>
          }
        >
          <MenuLabel>Create</MenuLabel>
          <MenuItem onSelect={() => navigate('/orders?new=1')}>Order</MenuItem>
          <MenuItem onSelect={() => navigate('/products?new=1')}>Product</MenuItem>
          <MenuItem onSelect={() => navigate('/customers?new=1')}>Customer</MenuItem>
          <MenuItem onSelect={() => navigate('/expenses?new=1')}>Expense</MenuItem>
          <MenuItem onSelect={() => navigate('/tasks?new=1')}>Task</MenuItem>
        </Menu>

        <Menu
          align="end"
          trigger={
            <span>
              <IconButton label={`Theme: ${theme}`}>
                <ThemeIcon />
              </IconButton>
            </span>
          }
        >
          <MenuLabel>Theme</MenuLabel>
          <MenuItem icon={<Sun />} onSelect={() => setTheme('light')}>
            Light {theme === 'light' && '✓'}
          </MenuItem>
          <MenuItem icon={<Moon />} onSelect={() => setTheme('dark')}>
            Dark {theme === 'dark' && '✓'}
          </MenuItem>
          <MenuItem icon={<Monitor />} onSelect={() => setTheme('system')}>
            System {theme === 'system' && '✓'}
          </MenuItem>
        </Menu>

        <NotificationsPanel />

        <button
          onClick={() => navigate('/settings')}
          className="ml-1 flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-sunken"
          aria-label="Business settings"
        >
          <Avatar name={settings.ownerName} size="sm" hue={262} />
          <span className="hidden max-w-[120px] truncate text-[13px] font-medium text-ink md:block">
            {settings.ownerName}
          </span>
        </button>
      </div>
    </header>
  )
}
