export const blocksFinalInspection = requests => requests.some(request =>
  ['pending_staff_review', 'pending_client_approval', 'approved'].includes(request.status))

export const canRequestAdditionalWork = (role, bookingStatus, jobId) =>
  ['mechanic', 'admin'].includes(role) && bookingStatus === 'in_service' && Boolean(jobId)

export const canReviewAdditionalWork = (role, request) =>
  ['staff', 'admin'].includes(role) && request.status === 'pending_staff_review'

export const canDecideAdditionalWork = (role, request) =>
  role === 'client' && request.status === 'pending_client_approval'

export const canPerformAdditionalWork = (role, request) =>
  ['mechanic', 'admin'].includes(role) && request.status === 'approved'
