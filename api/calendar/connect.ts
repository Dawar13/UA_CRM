/** Starts Google consent for the signed-in member (POST, their Supabase token). */
import { route } from '../_lib/deps.js'
import { handleConnect } from '../_lib/handlers.js'

export default route(handleConnect)
