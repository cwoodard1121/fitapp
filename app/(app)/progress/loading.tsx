import { SkeletonBlock, SkeletonHeaderBar, SkeletonPage } from '@/components/ui'

export default function ProgressLoading() {
  return (
    <SkeletonPage maxWidth="3xl" className="space-y-4 pb-24 pt-6 sm:pt-8">
      <SkeletonHeaderBar />
      <SkeletonBlock className="h-48 w-full" />
      <SkeletonBlock className="h-64 w-full" />
    </SkeletonPage>
  )
}
