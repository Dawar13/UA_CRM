/** Google's push notification for a changed calendar: syncs that member (D-051). */
import { route } from '../_lib/deps.js'
import { handleWebhook } from '../_lib/handlers.js'

export default route(handleWebhook)
