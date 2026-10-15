import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, CircularProgress, IconButton, Paper, Stack, Typography } from '@mui/material'
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import api from '../services/api'

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const utcDate = date => date.toISOString().slice(0, 10)
function todayInManila() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
function displayTime(date, time) {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })
    .format(new Date(`${date}T${time}:00+08:00`))
}
function monthName(month) { return new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month) }

export default function BookingDateTimePicker({ serviceIds, selectedDate, selectedScheduleId, onChange, disabled = false, refreshKey = 0, defaultToday = false }) {
  const sortedIds = useMemo(() => [...serviceIds].sort(), [serviceIds])
  const serviceKey = sortedIds.join(',')
  const [month, setMonth] = useState(() => {
    const now = todayInManila().split('-').map(Number)
    return new Date(Date.UTC(now[0], now[1] - 1, 1))
  })
  const [days, setDays] = useState([])
  const [loadedKey, setLoadedKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const today = todayInManila()
  const year = month.getUTCFullYear()
  const monthIndex = month.getUTCMonth()
  const monthStart = utcDate(new Date(Date.UTC(year, monthIndex, 1)))
  const monthEnd = utcDate(new Date(Date.UTC(year, monthIndex + 1, 0)))
  const requestKey = `${serviceKey}|${monthStart}|${monthEnd}`
  const currentResults = loadedKey === requestKey
  const availabilityPending = Boolean(serviceKey) && (!currentResults || loading)

  useEffect(() => {
    if (!serviceKey) return undefined
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(true); setLoadError('') } })
    api.get('/bookings/availability', { params: { services: serviceKey, fromDate: monthStart, toDate: monthEnd }, signal: controller.signal })
      .then(response => { setDays(response.data.dates || []); setLoadedKey(requestKey) })
      .catch(() => { if (!controller.signal.aborted) { setDays([]); setLoadError('Availability could not be loaded. Please try again.'); setLoadedKey(requestKey) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [serviceKey, monthStart, monthEnd, requestKey, refreshKey])

  const dateMap = new Map((currentResults ? days : []).map(day => [day.date, day]))
  useEffect(() => {
    if (defaultToday && !selectedDate && currentResults && days.some(day => day.date === today && day.available)) onChange(today, null)
  }, [defaultToday, selectedDate, currentResults, days, today, onChange])
  const selectedDay = dateMap.get(selectedDate)
  const firstOffset = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()
  const dayCount = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const cells = [...Array(firstOffset).fill(null), ...Array.from({ length: dayCount }, (_, index) => utcDate(new Date(Date.UTC(year, monthIndex, index + 1))))]
  while (cells.length % 7) cells.push(null)
  const previousMonth = new Date(Date.UTC(year, monthIndex - 1, 1))
  const thisMonth = new Date(`${today.slice(0, 7)}-01T00:00:00Z`)

  function chooseDate(date, day) {
    if (!day?.available) return
    onChange(date, null)
  }

  return <Stack spacing={2}>
    {!serviceKey && <Alert severity="info">Choose at least one service to see available dates and times.</Alert>}
    {currentResults && loadError && <Alert severity="error">{loadError}</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(300px, 1.1fr) minmax(260px, .9fr)' }, gap: 2, minWidth: 0 }}>
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderColor: 'var(--line)', borderRadius: 2.5, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <IconButton aria-label="Previous month" disabled={disabled || previousMonth < thisMonth} onClick={() => { onChange('', null); setMonth(previousMonth) }}><ChevronLeftRounded /></IconButton>
          <Typography component="h3" sx={{ fontWeight: 700 }}>{monthName(month)}</Typography>
          <IconButton aria-label="Next month" disabled={disabled} onClick={() => { onChange('', null); setMonth(new Date(Date.UTC(year, monthIndex + 1, 1))) }}><ChevronRightRounded /></IconButton>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: { xs: .4, sm: .75 } }}>
          {dayNames.map(name => <Typography key={name} sx={{ textAlign: 'center', fontSize: 11, color: 'text.secondary', py: .75 }}>{name}</Typography>)}
          {cells.map((date, index) => {
            const day = dateMap.get(date)
            const past = date && date < today
            const chosen = date === selectedDate
            const current = date === today
            return <Button key={date || `empty-${index}`} disabled={!date || past || !day?.available || !serviceKey || availabilityPending || disabled}
              aria-label={date ? `${date}${day?.available ? ', available' : ', unavailable'}` : 'empty'}
              aria-pressed={chosen} onClick={() => chooseDate(date, day)}
              sx={{ minWidth: 0, minHeight: { xs: 38, sm: 42 }, p: 0, border: '1px solid', borderColor: chosen || current ? 'var(--blue-ink)' : 'transparent',
                borderWidth: chosen || current ? 1.5 : 1, borderRadius: 2, bgcolor: chosen ? 'var(--blue-fill)' : 'transparent',
                color: chosen ? 'var(--action-ink)' : day?.available ? 'text.primary' : 'text.disabled', fontWeight: chosen || current ? 700 : 500,
                '&:hover': { bgcolor: chosen ? 'var(--blue-hover)' : 'action.hover' }, '&.Mui-disabled': { color: 'text.disabled', opacity: .55 } }}>
              {date ? Number(date.slice(-2)) : ''}
            </Button>
          })}
        </Box>
        <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }} alignItems="center">
          <Box sx={{ width: 12, height: 12, border: '1.5px solid', borderColor: 'primary.main', borderRadius: '50%' }} />
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Today</Typography>
          <Box sx={{ width: 12, height: 12, bgcolor: 'primary.main', borderRadius: '50%', ml: 1 }} />
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Selected</Typography>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderColor: 'var(--line)', borderRadius: 2.5, minWidth: 0 }}>
        <Typography component="h3" sx={{ fontWeight: 700, mb: .5 }}>{selectedDate ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${selectedDate}T00:00:00Z`)) : 'Available times'}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1.5 }}>Times account for service duration and available staff and bays.</Typography>
        {availabilityPending ? <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress size={24} /></Stack>
          : !serviceKey ? <Typography sx={{ py: 3, textAlign: 'center', color: 'text.secondary', fontSize: 13 }}>Available appointments appear after you choose services.</Typography>
            : !selectedDate ? <Typography sx={{ py: 3, textAlign: 'center', color: 'text.secondary', fontSize: 13 }}>Choose an available date to view start times.</Typography>
              : !selectedDay?.slots?.length ? <Typography sx={{ py: 3, textAlign: 'center', color: 'text.secondary', fontSize: 13 }}>No available appointments for this date. Please choose another date.</Typography>
                : <Stack spacing={1} sx={{ maxHeight: { md: 330 }, overflowY: 'auto', pr: .5 }}>
                  {selectedDay.slots.map(slot => {
                    const selected = slot.scheduleId === selectedScheduleId
                    return <Button key={slot.scheduleId} variant="outlined" disabled={!slot.available || disabled}
                      onClick={() => onChange(selectedDate, slot)} sx={{ justifyContent: 'space-between', alignItems: 'center', textTransform: 'none', px: 1.5, py: 1.1, minHeight: 58,
                        borderColor: selected ? 'var(--blue-ink)' : 'var(--line)', borderWidth: selected ? 1.5 : 1,
                        bgcolor: selected ? 'var(--blue-soft)' : 'background.paper', color: selected ? 'var(--blue-ink)' : 'text.primary',
                        '&:hover': { borderColor: 'var(--blue-ink)', bgcolor: 'var(--blue-soft)' },
                        '&.Mui-disabled': { borderColor: 'var(--line)', bgcolor: 'action.disabledBackground', color: 'text.disabled', opacity: .72 } }}>
                      <Box sx={{ textAlign: 'left' }}><Typography sx={{ fontWeight: 700, color: slot.available ? (selected ? 'var(--blue-ink)' : 'text.primary') : 'text.disabled' }}>{displayTime(selectedDate, slot.time)}</Typography>
                        <Typography sx={{ fontSize: 11, color: slot.available ? 'success.main' : 'text.disabled' }}>{slot.available ? `${slot.mechanicCount} ${slot.mechanicCount === 1 ? 'mechanic' : 'mechanics'} available` : slot.unavailableLabel || 'Fully booked'}</Typography></Box>
                      {slot.available && <Stack direction="row" spacing={.75} alignItems="center">
                        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Until {displayTime(selectedDate, slot.estimatedEndTime)}</Typography>
                        {selected && <CheckCircleRounded sx={{ fontSize: 18, color: 'var(--blue-ink)' }} aria-label="Selected" />}
                      </Stack>}
                    </Button>
                  })}
                </Stack>}
      </Paper>
    </Box>
  </Stack>
}
