import { redirect } from 'next/navigation';

export default function PONewPage() {
  // 廃止: 旧 `/po/new` はカート方式に統一したため、`/po/cart` へ誘導する
  redirect('/po/cart');
}
