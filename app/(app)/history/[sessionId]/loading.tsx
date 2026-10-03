import { SkeletonBlock, SkeletonHeaderBar, SkeletonPage, SkeletonRow } from '@/components/ui'

export default function SessionDetailLoading() {
  return (
    <SkeletonPage maxWidth="3xl" className="space-y-3 py-5 pt-4">
      <SkeletonHeaderBar />
      <SkeletonBlock className="h-16 w-full" />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </SkeletonPage>
  )
}
