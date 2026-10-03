import { SkeletonBlock, SkeletonHeaderBar, SkeletonPage } from '@/components/ui'

export default function SettingsLoading() {
  return (
    <SkeletonPage maxWidth="3xl" className="space-y-6 pb-28 pt-6 sm:pb-12">
      <SkeletonHeaderBar />
      <SkeletonBlock className="h-64 w-full" />
      <SkeletonBlock className="h-40 w-full" />
      <SkeletonBlock className="h-32 w-full" />
    </SkeletonPage>
  )
}
