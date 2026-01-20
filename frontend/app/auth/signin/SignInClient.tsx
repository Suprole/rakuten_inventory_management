'use client';

import { useEffect, useMemo } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SignInClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();

  const callbackUrl = useMemo(() => {
    const v = (searchParams?.get('callbackUrl') || '').trim();
    return v || '/';
  }, [searchParams]);

  const error = (searchParams?.get('error') || '').trim();

  // 既にログイン済みなら、サインイン画面に居続けない
  useEffect(() => {
    if (session.status !== 'authenticated') return;
    router.replace(callbackUrl);
  }, [session.status, router, callbackUrl]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>ログイン</CardTitle>
          <CardDescription>
            Googleアカウントでログインしてください（許可されたメールアドレスのみ閲覧できます）
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              ログインできませんでした（許可されていないメールアドレスの可能性があります）: {error}
            </div>
          )}
          <Button
            className="w-full"
            size="lg"
            onClick={() => signIn('google', { callbackUrl })}
            disabled={session.status === 'loading'}
          >
            Googleでログイン
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

