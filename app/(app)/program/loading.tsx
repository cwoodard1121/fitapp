import { SkeletonBlock, SkeletonHeaderBar, SkeletonPage } from '@/components/ui'

export default function ProgramLoading() {
  return (
    <SkeletonPage maxWidth="3xl" className="space-y-4 py-8 pt-4">
      <SkeletonHeaderBar withAction />
      <SkeletonBlock className="h-20 w-full" />
      <SkeletonBlock className="h-64 w-full" />
    </SkeletonPage>
  )
}
