import { Skeleton } from '@/components/ui/skeleton'
import { SkeletonBlock, SkeletonChips, SkeletonPage } from '@/components/ui'

export default function TodayLoading() {
  return (
    <SkeletonPage maxWidth="2xl" className="pt-3 sm:pt-3">
      <div className="flex gap-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="size-11 rounded-md bg-surface" />
        ))}
      </div>
      <div className="mt-3">
        <SkeletonChips count={5} />
      </div>
      <Skeleton className="mt-6 h-9 w-40" />
      <Skeleton className="mt-3 h-4 w-48" />
      <div className="mt-5 flex gap-1">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-2.5 flex-1 rounded-[3px]" />
        ))}
      </div>
      <SkeletonBlock className="mt-7 h-16 w-full" />
      <SkeletonBlock className="mt-4 h-80 w-full" />
      <SkeletonBlock className="mt-4 h-80 w-full" />
    </SkeletonPage>
  )
}
