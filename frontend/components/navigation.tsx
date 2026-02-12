'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Package, ShoppingCart, AlertTriangle, AlertCircle, FileText } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/use-cart';

const navItems = [
  {
    title: '在庫一覧',
    href: '/items',
    icon: Package,
  },
  {
    title: 'カート',
    href: '/po/cart',
    icon: ShoppingCart,
  },
  {
    title: '発注管理',
    href: '/po',
    icon: FileText,
  },
  {
    title: 'ミラーずれ監視',
    href: '/monitor/mirror',
    icon: AlertTriangle,
  },
  {
    title: 'BOM未紐付け監視',
    href: '/monitor/bom-unmapped',
    icon: AlertCircle,
  },
];

export function Navigation() {
  const pathname = usePathname();
  const session = useSession();
  const email = session.data?.user?.email || '';
  const cart = useCart();

  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                <Package className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold text-foreground">
                楽天在庫管理
              </span>
            </Link>
            <div className="hidden md:flex md:gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.title}
                    {item.href === '/po/cart' && cart.lineCount > 0 && (
                      <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                        {cart.lineCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm text-muted-foreground">
              {email ? email : 'Metro & Windy 店舗'}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent"
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            >
              ログアウト
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
