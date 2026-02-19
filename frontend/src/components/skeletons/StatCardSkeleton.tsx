import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

export function StatCardSkeleton() {
  return (
    <Card className="bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] border-[var(--color-bg-light)] p-6">
      <div className="text-center">
        <Skeleton className="h-4 w-20 mb-3 mx-auto skeleton-neon" />
        <Skeleton className="h-9 w-24 mx-auto skeleton-neon" />
        <Skeleton className="h-3 w-16 mt-2 mx-auto skeleton-neon" />
      </div>
    </Card>
  )
}

export function StatCardSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  )
}
