import { SkeletonBlock, SkeletonHeaderBar, SkeletonPage } from '@/components/ui'

export default function BlocksLoading() {
  return (
    <SkeletonPage maxWidth="3xl" className="space-y-4 pb-24 pt-5 sm:pt-6">
      <SkeletonHeaderBar withAction />
      <SkeletonBlock className="h-32 w-full" />
      <SkeletonBlock className="h-32 w-full" />
    </SkeletonPage>
  )
}
