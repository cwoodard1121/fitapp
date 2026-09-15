import { SkeletonBlock, SkeletonHeaderBar, SkeletonPage } from '@/components/ui'

export default function BodyLoading() {
  return (
    <SkeletonPage maxWidth="2xl" className="space-y-4 py-6 pt-4">
      <SkeletonHeaderBar withAction />
      <SkeletonBlock className="h-28 w-full" />
      <SkeletonBlock className="h-40 w-full" />
      <SkeletonBlock className="h-48 w-full" />
    </SkeletonPage>
  )
}
