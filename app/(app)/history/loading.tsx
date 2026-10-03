import { SkeletonHeaderBar, SkeletonPage, SkeletonRow } from '@/components/ui'

export default function HistoryLoading() {
  return (
    <SkeletonPage maxWidth="3xl" className="space-y-3 py-5 pt-4">
      <SkeletonHeaderBar />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </SkeletonPage>
  )
}
