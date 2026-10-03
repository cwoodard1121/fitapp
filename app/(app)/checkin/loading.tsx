import { Skeleton } from '@/components/ui/skeleton'
import { SkeletonBlock, SkeletonPage } from '@/components/ui'

export default function CheckinLoading() {
  return (
    <SkeletonPage maxWidth="2xl" className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-64" />
      </div>
      <SkeletonBlock className="h-64 w-full" />
      <SkeletonBlock className="h-44 w-full" />
      <SkeletonBlock className="h-28 w-full" />
    </SkeletonPage>
  )
}
