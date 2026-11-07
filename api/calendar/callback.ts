/** Google's redirect back after consent: stores the encrypted token and runs the first sync. */
import { route } from '../_lib/deps.js'
import { handleCallback } from '../_lib/handlers.js'

export default route(handleCallback)
