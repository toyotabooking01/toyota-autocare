import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import ConfirmationDialog from './ConfirmationDialog'
import { ConfirmationContext } from './ConfirmationContext'
import { createConfirmationController } from './confirmationState'

export default function ConfirmationProvider({ children }) {
  const [request, setRequest] = useState(null)
  const [controller] = useState(() => createConfirmationController(setRequest))
  const { key } = useLocation()
  // A pending decision must never execute after navigating away from its form.
  useEffect(() => { controller.cancel() }, [controller, key])
  useEffect(() => () => controller.dispose(), [controller])
  return <ConfirmationContext.Provider value={controller.request}>
    {children}
    <ConfirmationDialog open={Boolean(request)} {...request} onConfirm={controller.approve} onCancel={controller.cancel} />
  </ConfirmationContext.Provider>
}
