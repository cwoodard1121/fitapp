import { SkeletonBlock, SkeletonHeaderBar, SkeletonPage } from '@/components/ui'

export default function NutritionLoading() {
  return (
    <SkeletonPage maxWidth="3xl" className="space-y-4 pb-28 pt-5 sm:pb-10">
      <SkeletonHeaderBar withAction />
      <SkeletonBlock className="h-28 w-full" />
      <SkeletonBlock className="h-40 w-full" />
      <SkeletonBlock className="h-56 w-full" />
    </SkeletonPage>
  )
}
