import { Link } from 'react-router'
import { BrandMark } from '@/components/crm/BrandLockup'
import { Button } from '@/components/ui/Button'

export function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6" data-testid="not-found">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <BrandMark size={40} />
        <h1 className="text-lg text-text">This page doesn't exist</h1>
        <p className="text-base text-secondary">
          The link may be old, or the sheet may have moved. Your contacts are safe.
        </p>
        <Button asChild>
          <Link to="/">Go to your sheets</Link>
        </Button>
      </div>
    </main>
  )
}
