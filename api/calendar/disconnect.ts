/** Stops sync, revokes Google's token and deletes the stored calendar data. */
import { route } from '../_lib/deps.js'
import { handleDisconnect } from '../_lib/handlers.js'

export default route(handleDisconnect)
