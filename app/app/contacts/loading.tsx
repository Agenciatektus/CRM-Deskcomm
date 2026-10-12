import { Pagina } from "@/components/pagina";
import { Skeleton } from "@/components/ui/skeleton";

export default function ContactsLoading() {
  return (
    <Pagina className="gap-4 mb:px-4 mb:pt-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </Pagina>
  );
}
