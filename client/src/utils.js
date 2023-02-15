import * as dayjs from 'dayjs';
import * as duration from 'dayjs/plugin/duration';
dayjs.extend(duration);

const ds = dayjs;
window.ds = dayjs;
export { dayjs, ds };

const { duration: make_duration } = dayjs;

const SECONDS_IN = { MINUTE: 0, HOUR: 0, DAY: 0 };
SECONDS_IN.MINUTE = 60;
SECONDS_IN.HOUR = SECONDS_IN.MINUTE * 60;
SECONDS_IN.DAY = SECONDS_IN.HOUR * 24;

export function split_duration(duration) {
  let remainingSeconds = duration.asSeconds() * 1;

  const days = Math.trunc(duration.asDays());
  remainingSeconds -= days * SECONDS_IN.DAY;

  const hours = Math.trunc(make_duration({ seconds: remainingSeconds }).asHours());
  remainingSeconds -= hours * SECONDS_IN.HOUR;

  const minutes = Math.trunc(make_duration({ seconds: remainingSeconds }).asMinutes());
  remainingSeconds -= minutes * SECONDS_IN.MINUTE;

  const seconds = remainingSeconds;

  return { days, hours, minutes, seconds };
}

window.split_duration = split_duration;

export function format_duration(duration) {
  const { days, hours, minutes, seconds } = split_duration(duration);

  if (days == 0 && hours == 0 && minutes == 0)
    return `${seconds} seconds`;

  if (days == 0 && hours == 0)
    return `${minutes} mins`;

  if (days) return `${days} Days ${hours} Hrs`;

  return `${hours} Hrs`;
}

export function format_minutes(mins) {
  return format_duration(make_duration({ minutes: mins }));
}

export function format_seconds(seconds) {
  return format_duration(make_duration({ seconds: seconds }));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function pad_start(num, size = 2) {
  var s = '000000000' + num;
  return s.substr(s.length - size);
}

export function hide_sensitive_number(number) {
  if (number) {
    return number.toString().replace(/\d/g, 'X');
  }
  return number;
}

export function hide_sensitive_string(string) {
  if (string) {
    return string.toString().replace(/[a-zA-Z0-9]/g, 'X');
  }
  return string;
}

// Hehe :)
export function blurAllInputs() {
  var tmp = document.createElement('input');
  document.body.appendChild(tmp);
  tmp.focus();
  document.body.removeChild(tmp);
}

window.pad_start = pad_start;

let _createWindowId = 1;
function output_json_source(obj, title = 'Title') {
  let win = window.open(
    '',
    (_createWindowId++).toString(),
    'toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=yes,resizable=yes'
  );

  const targetHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
</head>
<body>
<pre>${JSON.stringify(obj, void 0, 2)}</pre>
</body>
</html>`;

  win.document.body.innerHTML = targetHTML;
}

export function dateComparator(date1, date2) {
  const date1Formatted = new Date(date1);
  const date2Formatted = new Date(date2);

  return date1Formatted.getTime() - date2Formatted.getTime();
}

export function nextRewardComparator(data1, data2) {
  const val1 = data1.split(" ");
  const val2 = data2.split(" ");
  if (val1[1] === val2[1]) {
    return parseInt(val1[0]) - parseInt(val2[0]);
  }

  if (val1[1] === 'days') return 1;
  if (val2[1] === 'days') return -1;

  if (val1[1] === 'Hrs') return 1;
  if (val2[1] === 'Hrs') return -1;

  if (val1[1] === 'mins') return 1;
  if (val2[1] === 'mins') return -1;

  if (val1[1] === 'seconds') return 1;
  if (val2[1] === 'seconds') return -1;
}

export function format_amount(amount, enablePrivacyMode) {
  if (enablePrivacyMode) {
    return hide_sensitive_number(amount);
  }
  return format_thousands_separator(amount);
}

function format_thousands_separator(amount) {
  if (Number.isNaN(amount)) {
    throw new Error('Invalid amount type');
  }
  return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function calculate_float_number(amount) {
  if (Number.isNaN(amount)) {
    throw new Error('Invalid amount type');
  }

  return Math.round(amount * 100) / 100;
}