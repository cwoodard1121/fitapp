import {
  SkeletonBlock,
  SkeletonChips,
  SkeletonHeaderBar,
  SkeletonPage,
  SkeletonRow,
} from '@/components/ui'

export default function TodayLoading() {
  return (
    <SkeletonPage maxWidth="2xl" className="space-y-4 pb-4">
      <SkeletonHeaderBar />
      <SkeletonBlock className="h-16 w-full" />
      <SkeletonChips count={4} />
      <SkeletonChips count={5} />
      <SkeletonBlock className="h-24 w-full" />
      <div className="space-y-3">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </SkeletonPage>
  )
}
