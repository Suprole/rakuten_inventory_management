import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

// eslint-config-next@16 は flat config を提供している（配列）。
// package.json の "exports" 制約を回避するため、実ファイルパスで読み込む。
const nextCoreWebVitals = require(
  fileURLToPath(new URL('./node_modules/eslint-config-next/dist/core-web-vitals.js', import.meta.url))
);
const nextTypescript = require(
  fileURLToPath(new URL('./node_modules/eslint-config-next/dist/typescript.js', import.meta.url))
);

const config = [...nextCoreWebVitals, ...nextTypescript];

export default config;

