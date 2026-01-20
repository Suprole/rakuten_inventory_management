import { withAuth } from 'next-auth/middleware';

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

function isAllowedEmail(email?: string | null): boolean {
  const list = parseAllowedEmails();
  if (list.size === 0) return false; // 安全側：未設定なら全拒否
  const e = (email || '').trim().toLowerCase();
  if (!e) return false;
  return list.has(e);
}

export default withAuth({
  callbacks: {
    authorized: ({ token }) => {
      const email = (token?.email as string | undefined) || undefined;
      return Boolean(token) && isAllowedEmail(email);
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
});

export const config = {
  matcher: [
    // pages + API（auth系/静的ファイル/サインイン画面は除外）
    '/((?!api/auth|auth/signin|_next/static|_next/image|favicon.ico|icon|apple-icon).*)',
  ],
};

