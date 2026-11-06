/** After the live tests: the invented team and everything they made are removed. */
import { clearProject, serviceClient } from './team'

export default async function teardown(): Promise<void> {
  await clearProject(serviceClient())
}
