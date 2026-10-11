import { Box, Typography } from '@mui/material'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlined'
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked'
import { passwordRequirements } from '../../../shared/accountValidation.mjs'

export default function PasswordRequirements({ password }) {
  return <Box component="ul" aria-label="Password requirements" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: .7 }}>
    {passwordRequirements(password).map(({ label, met }) => <Box component="li" key={label} sx={{ display: 'flex', alignItems: 'center', gap: .8, color: password && met ? 'success.main' : 'text.secondary' }}>
      {password && met ? <CheckCircleOutline sx={{ fontSize: 16 }} /> : <RadioButtonUnchecked sx={{ fontSize: 16 }} />}
      <Typography component="span" sx={{ fontSize: 12, position: 'relative' }}><Box component="span" sx={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)' }}>{password && met ? 'Satisfied: ' : 'Not yet satisfied: '}</Box>{label}</Typography>
    </Box>)}
  </Box>
}
