import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

function parseAllowedEmails(): Set<string> {
  const raw = (process.env.AUTH_ALLOWED_EMAILS || '').trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAllowedEmail(email?: string | null): boolean {
  const list = parseAllowedEmails();
  if (list.size === 0) return false; // 安全側：未設定なら全拒否
  const e = (email || '').trim().toLowerCase();
  if (!e) return false;
  return list.has(e);
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async signIn({ user }) {
      return isAllowedEmail(user.email);
    },
    async jwt({ token, user }) {
      // 初回ログイン時にemailを確実に載せる
      if (user?.email) token.email = user.email;
      return token;
    },
  },
};

