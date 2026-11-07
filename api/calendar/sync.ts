/** Syncs the signed-in member's calendar now (at most once a minute). */
import { route } from '../_lib/deps.js'
import { handleSync } from '../_lib/handlers.js'

export default route(handleSync)
