import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined'
import { workspaceCardWidth } from '../layouts/workspaceDimensions'

const metricIcons = {
  blue: CalendarMonthOutlined,
  amber: ScheduleOutlined,
  purple: BuildOutlined,
  green: TaskAltOutlined,
}

export function Panel({ title, to, action = 'View all', children, sx = {}, className = '' }) {
  return <Paper variant="outlined" className={className} sx={{ ...workspaceCardWidth, containerType: 'inline-size', p: { xs: 2, md: 2.5 }, borderColor: 'var(--line)', borderRadius: 2, ...sx }}>
    <Stack direction="row" sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
      <Typography component="h2" sx={{ fontSize: 14, fontWeight: 650 }}>{title}</Typography>
      {to && <Button component={Link} to={to} size="small" sx={{ minHeight: 28, p: .5, fontSize: 11, flexShrink: 0 }}>{action}</Button>}
    </Stack>{children}
  </Paper>
}
export function PageHeading({ title, subtitle }) {
  return <Box sx={{ mb: 3 }}>
    <Typography component="h1" sx={{ fontSize: { xs: 24, md: 29 }, fontWeight: 700, letterSpacing: -.8, lineHeight: 1.2 }}>{title}</Typography>
    <Typography sx={{ mt: .8, fontSize: 13, color: 'text.secondary' }}>{subtitle}</Typography>
  </Box>
}
export function MetricCards({ items }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.5, md: 2 }, mb: 2.5 }}>
    {items.map(item => { const Icon = metricIcons[item.tone]
      return <Paper key={item.label} component={item.to ? Link : 'div'} {...(item.to ? { to: item.to } : {})} variant="outlined"
        className={item.to ? 'dashboard-metric-card dashboard-metric-card--linked' : 'dashboard-metric-card'}
        sx={{ p: { xs: 1.5, md: 2.5 }, borderColor: 'var(--line)', borderRadius: 2, color: 'inherit', textDecoration: 'none' }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box className="dashboard-metric-icon" data-tone={item.tone}>{item.icon || <Icon />}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 650 }}>{item.label}</Typography>
            <Typography sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, mt: .35 }}>{item.value}</Typography>
            <Typography sx={{ mt: .65, fontSize: 11, color: 'text.secondary' }}>{item.detail}</Typography>
          </Box>
        </Stack>
      </Paper>
    })}
  </Box>
}
