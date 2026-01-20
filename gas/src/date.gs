function getJstToday() {
  // JST日付（yyyy-MM-dd）を固定してDate化
  var tz = 'Asia/Tokyo';
  var y = Number(Utilities.formatDate(new Date(), tz, 'yyyy'));
  var m = Number(Utilities.formatDate(new Date(), tz, 'MM')); // 1-12
  var d = Number(Utilities.formatDate(new Date(), tz, 'dd')); // 1-31
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

function getDayOfMonthJst(today) {
  var tz = 'Asia/Tokyo';
  return Number(Utilities.formatDate(today, tz, 'd'));
}

function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function getPrevMonthYearMonthJst(today) {
  var tz = 'Asia/Tokyo';
  var y = Number(Utilities.formatDate(today, tz, 'yyyy'));
  var m = Number(Utilities.formatDate(today, tz, 'M')); // 1-12
  if (m === 1) return { year: y - 1, month1to12: 12 };
  return { year: y, month1to12: m - 1 };
}

