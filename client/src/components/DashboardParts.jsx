import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined'

export function Panel({ title, to, action = 'View all', children, sx = {} }) {
  return <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: '#e5eaf1', borderRadius: 2.5, minWidth: 0, ...sx }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 2 }}>
      <Typography component="h2" sx={{ fontSize: 14, fontWeight: 700 }}>{title}</Typography>
      {to && <Button component={Link} to={to} size="small" sx={{ minHeight: 28, p: .5, fontSize: 11, flexShrink: 0 }}>{action}</Button>}
    </Stack>{children}
  </Paper>
}
export function PageHeading({ title, subtitle }) {
  return <Box sx={{ mb: 3 }}>
    <Typography component="h1" sx={{ fontSize: { xs: 24, md: 29 }, fontWeight: 750, letterSpacing: -.8, lineHeight: 1.2 }}>{title}</Typography>
    <Typography sx={{ mt: .8, fontSize: 13, color: 'text.secondary' }}>{subtitle}</Typography>
  </Box>
}
export function MetricCards({ items }) {
  const styles = {
    blue: { color: '#3972a6', bg: '#eff5fc', icon: CalendarMonthOutlined },
    amber: { color: '#9a722d', bg: '#fcf5e9', icon: ScheduleOutlined },
    purple: { color: '#796194', bg: '#f5f0fb', icon: BuildOutlined },
    green: { color: '#2d8050', bg: '#eef8f0', icon: TaskAltOutlined },
  }
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.5, md: 2 }, mb: 2.5 }}>
    {items.map(item => { const style = styles[item.tone]; const Icon = style.icon
      return <Paper key={item.label} variant="outlined" sx={{ p: { xs: 1.5, md: 2.5 }, borderColor: '#e5eaf1', borderRadius: 2.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ p: 1, borderRadius: '50%', bgcolor: style.bg, color: style.color, display: { xs: 'none', sm: 'flex' } }}><Icon sx={{ fontSize: 24 }} /></Box>
          <Box><Typography sx={{ fontSize: 11, fontWeight: 650 }}>{item.label}</Typography><Typography sx={{ fontSize: 28, fontWeight: 750, lineHeight: 1.5 }}>{item.value}</Typography></Box>
        </Stack><Typography sx={{ mt: .5, fontSize: 11, color: 'text.secondary' }}>{item.detail}</Typography>
      </Paper>
    })}
  </Box>
}
