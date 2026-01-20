import { redirect } from 'next/navigation';

export default function POListAliasPage() {
  // `/po/list` はAPIではなく、誤って `/po/[id]` の `id=list` と解釈されやすいので
  // 明示的に発注一覧ページへ誘導する。
  redirect('/po');
}

