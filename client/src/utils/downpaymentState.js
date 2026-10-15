export function downpaymentState(summary, bookingStatus, now) {
  const status = summary?.bookingStatus || bookingStatus
  const latest = summary?.payments?.filter(payment => payment.stage === 'downpayment').at(-1)
  const provisional = status === 'awaiting_downpayment'
  const secondsRemaining = provisional && summary?.holdExpiresAt
    ? Math.max(0, Math.ceil((new Date(summary.holdExpiresAt).getTime() - now) / 1000)) : 0
  const holdActive = provisional && summary?.holdStatus === 'active' && secondsRemaining > 0
  const converted = summary?.holdStatus === 'converted' && latest?.status === 'verified'
  const reserved = converted && !['cancelled', 'rejected', 'no_show'].includes(status)
  const rejected = provisional && latest?.status === 'rejected'
  return { status, latest, provisional, secondsRemaining, holdActive, converted, rejected,
    paymentLabel: converted ? 'Downpayment Verified' : rejected ? 'Downpayment Rejected'
      : provisional && summary?.holdStatus === 'payment_submitted' ? 'Pending Verification'
        : provisional ? 'Awaiting Downpayment' : null,
    reservationLabel: reserved ? 'Reserved' : null,
    canRetry: rejected && holdActive,
    retryExpired: rejected && !holdActive,
  }
}
