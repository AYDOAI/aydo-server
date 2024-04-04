
export function checkTimeoutEx(item, ident, method, timeout = 1000, force = false) {
  if (force || !item[ident] || new Date().getTime() - item[ident] >= timeout) {
    clearTimeout(item[`${ident}_timeout`]);
    item[ident] = new Date().getTime();
    method();
  } else {
    clearTimeout(item[`${ident}_timeout`]);
    item[`${ident}_timeout`] = setTimeout(() => {
      item[ident] = new Date().getTime();
      method();
    }, timeout - (new Date().getTime() - item[ident]));
  }
}

export function removeLast(data, chr = '\n') {
  let result = data;
  if (data && data[data.length - 1] === chr) {
    result = data.substring(0, data.length - 1);
  }
  return result
}