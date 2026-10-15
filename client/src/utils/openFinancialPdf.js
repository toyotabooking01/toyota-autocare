import api from '../services/api'

export const financialDocumentButtonLabel = type => type === 'final_service' ? 'View Invoice'
  : type === 'full_payment' ? 'View Full Payment Receipt' : 'View Receipt'

export async function openFinancialPdf({ kind, id, expectedType, onError }) {
  // Open during the click gesture so an asynchronous authorization check does not trigger a popup blocker.
  const pdfWindow = window.open('about:blank', '_blank')
  if (!pdfWindow) {
    onError('Allow pop-ups to view the document PDF.')
    return
  }
  // A handle is needed until the lookup finishes; remove the opener before navigating to Cloudinary.
  pdfWindow.opener = null
  onError('')
  try {
    const endpoint = kind === 'invoice' ? 'invoices' : 'receipts'
    const { data } = await api.get(`/${endpoint}/${id}`)
    const item = data?.item
    if (!item || (expectedType && item.type !== expectedType)) throw new Error('Document mismatch')
    const status = item.document?.status
    if (status !== 'generated' || !item.document.secureUrl) {
      pdfWindow.close()
      onError(['pending', 'processing'].includes(status) ? 'Document is being prepared.'
        : 'Document PDF is temporarily unavailable.')
      return
    }
    const url = new URL(item.document.secureUrl)
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !url.pathname.includes('/raw/upload/'))
      throw new Error('Unexpected document URL')
    pdfWindow.location.replace(item.document.secureUrl)
  } catch {
    pdfWindow.close()
    onError('Document could not be loaded.')
  }
}
