function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}

/**
 * 仕様書 6.2 listing（SKU）単位の需要推定
 */
function computeDemandRHat(params) {
  var LM = params.LM || 0;
  var CM = params.CM || 0;
  var d = Math.max(1, params.d || 1);
  var Dprev = Math.max(1, params.Dprev || 1);

  var rPrev = LM / Dprev;
  var rCur = CM / d;

  // LM=0例外：r_hat = r_cur（capは任意）
  if (LM === 0) {
    return Math.max(0, rCur);
  }

  var w = Math.min(0.7, d / 30);
  var rHatRaw = w * rCur + (1 - w) * rPrev;
  var rHat = clamp(rHatRaw, 0.5 * rPrev, 2.0 * rPrev);
  return Math.max(0, rHat);
}

function ceilToLot(qty, lot) {
  var l = Math.max(1, lot || 1);
  var q = Math.max(0, qty || 0);
  return Math.ceil(q / l) * l;
}

