/** The daily job (Vercel cron, CRON_SECRET): syncs every member and renews push channels. */
import { route } from '../_lib/deps.js'
import { handleCron } from '../_lib/handlers.js'

export default route(handleCron)
