import { css } from '@emotion/react'
import { Flex, Separator } from '@radix-ui/themes'
import {
  BugPlay,
  ChartColumnIcon,
  GaugeIcon,
  HammerIcon,
  VideoIcon,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import k6LogoDark from '@/assets/logo-dark.svg'
import k6Logo from '@/assets/logo.svg'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { formatDuration } from '@/components/Validator/format'
import { useTheme } from '@/hooks/useTheme'
import { getRoutePath, routeMap } from '@/routeMap'
import { useLoadRunStore } from '@/store/loadRun'

import { SidebarTab } from '../Layout.types'

import { CreateNewPopover } from './CreateNewPopover'
import { HelpButton } from './HelpButton'
import { Profile } from './Profile'
import { ProxyStatusIndicator } from './ProxyStatusIndicator'
import { SettingsButton } from './SettingsButton'
import { VersionLabel } from './VersionLabel'
import { VerticalTabButton } from './VerticalTabButton'

interface ActivityBarProps {
  activeTab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
}

export function ActivityBar({ activeTab, onTabChange }: ActivityBarProps) {
  const theme = useTheme()
  const navigate = useNavigate()

  // A load test keeps running while the app is on another view, so the tab it
  // belongs to says so — otherwise the only sign is the target under load.
  const isRunning = useLoadRunStore((state) => state.isRunning)
  const elapsed = useLoadRunStore((state) => state.stats?.elapsed ?? 0)

  return (
    <Flex
      height="100%"
      maxHeight="100%"
      maxWidth="100%"
      py="3"
      direction="column"
      align="center"
      position="relative"
      overflow="hidden"
    >
      <Link
        to={getRoutePath('home')}
        css={css`
          text-align: center;
        `}
        aria-label="Home"
      >
        <img
          src={theme === 'dark' ? k6LogoDark : k6Logo}
          role="presentation"
          width="32"
        />
      </Link>
      <Flex direction="column" align="center" gap="1" mt="4" width="100%">
        <CreateNewPopover />
        <Separator orientation="horizontal" size="2" my="2" />
        <VerticalTabButton
          icon={<VideoIcon />}
          tooltip="Record"
          active={activeTab === 'record'}
          onClick={() => onTabChange('record')}
        />
        <VerticalTabButton
          icon={<HammerIcon />}
          tooltip="Build"
          active={activeTab === 'build'}
          onClick={() => onTabChange('build')}
        />
        <VerticalTabButton
          icon={<BugPlay />}
          tooltip="Debug"
          active={activeTab === 'debug'}
          onClick={() => onTabChange('debug')}
        />
        <VerticalTabButton
          icon={<GaugeIcon />}
          tooltip={
            isRunning
              ? `Controller — running (${formatDuration(elapsed)})`
              : 'Controller'
          }
          badge={isRunning}
          active={activeTab === 'controller'}
          onClick={() => {
            onTabChange('controller')
            navigate(getRoutePath('controller'))
          }}
        />
        <VerticalTabButton
          icon={<ChartColumnIcon />}
          tooltip="Analysis"
          active={activeTab === 'analysis'}
          onClick={() => {
            onTabChange('analysis')
            navigate(routeMap.analysis)
          }}
        />
      </Flex>

      <Flex direction="column" align="center" gap="3" mt="auto">
        <ThemeSwitcher />
        <ProxyStatusIndicator />
        <SettingsButton />
        <HelpButton />
        <Separator orientation="horizontal" size="2" />
        <Flex direction="column" align="center" gap="3">
          <Profile />
          <VersionLabel />
        </Flex>
      </Flex>
    </Flex>
  )
}
