import { SkeletonBlock, SkeletonHeaderBar, SkeletonPage } from '@/components/ui'

export default function MesocycleLoading() {
  return (
    <SkeletonPage maxWidth="5xl" className="space-y-4 py-6 pt-4">
      <SkeletonHeaderBar />
      <SkeletonBlock className="h-28 w-full" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-24 w-full" />
      </div>
    </SkeletonPage>
  )
}
