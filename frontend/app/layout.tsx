import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { AuthSessionProvider } from '@/components/session-provider'

const geist = Geist({ subsets: ["latin"] });
const geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: '楽天2店舗ミラー在庫管理システム',
  description: '楽天市場2店舗（metro / windy）の在庫・需要予測・発注管理システム',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const enableAnalytics = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === '1';
  return (
    <html lang="ja">
      <body className={`${geist.className} ${geistMono.className} font-sans antialiased`}>
        <AuthSessionProvider>{children}</AuthSessionProvider>
        {enableAnalytics ? <Analytics /> : null}
      </body>
    </html>
  )
}
