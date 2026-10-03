import { SkeletonBlock, SkeletonPage } from '@/components/ui'

export default function BodyLoading() {
  return (
    <SkeletonPage maxWidth="3xl" className="space-y-4">
      <SkeletonBlock className="h-28 w-full" />
      <SkeletonBlock className="h-40 w-full" />
      <SkeletonBlock className="h-48 w-full" />
    </SkeletonPage>
  )
}
