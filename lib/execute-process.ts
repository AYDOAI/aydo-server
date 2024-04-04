import {spawn} from 'child_process';

export function promiseTimeout(ms, promise) {
  const timeout = new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject({code: 'timeout', message: 'Promise timeout'})
    }, ms)
  });
  return Promise.race([promise(), timeout])
}

export function executeProcess(command, args, options = null, byCode = false, timeout = 60000) {
  return promiseTimeout(timeout, () => {
    return new Promise((resolve, reject) => {
      let result = '';
      let error = '';
      const child = spawn(command, args, options);
      child.stdout.on('data', (data) => {
        let result1 = data ? data.toString() : '';
        result1 = result1.split('\n').filter(item => !!item).join('\n');
        result += result1;
        console.log(result1);
      });
      child.stderr.on('data', (data) => {
        let error1 = data ? data.toString() : '';
        error1 = error1.split('\n').filter(item => !!item).join('\n');
        error += error1;
        console.error(error1);
      });
      child.on('close', (code) => {
        byCode && !code ? resolve({result, error}) : (result ? resolve(result) : reject(error));
      });
    });
  });
}