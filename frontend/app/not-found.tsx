import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Navigation } from '@/components/navigation';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center text-center">
          <FileQuestion className="h-24 w-24 text-muted-foreground mb-6" />
          <h1 className="text-4xl font-bold text-foreground mb-4">
            ページが見つかりません
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            お探しのページは存在しないか、移動した可能性があります。
          </p>
          <Link href="/">
            <Button size="lg">ホームに戻る</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
