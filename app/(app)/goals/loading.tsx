import { SkeletonBlock, SkeletonHeaderBar, SkeletonPage } from '@/components/ui'

export default function GoalsLoading() {
  return (
    <SkeletonPage maxWidth="3xl" className="space-y-4 pb-28 pt-6 sm:pt-6">
      <SkeletonHeaderBar withAction />
      <div className="grid gap-3 sm:grid-cols-2">
        <SkeletonBlock className="h-36 w-full" />
        <SkeletonBlock className="h-36 w-full" />
        <SkeletonBlock className="h-36 w-full" />
        <SkeletonBlock className="h-36 w-full" />
      </div>
    </SkeletonPage>
  )
}
