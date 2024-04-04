import {AppOptions} from '../app';
import {toMixin} from '../../lib/foibles';

export const Log = toMixin(base => class Log extends base {

  load(options: AppOptions) {
    super.load(options);
  }

  log(...message) {
    console.log(...arguments);
  }

  error(...message) {
    console.error(...arguments);
  }

});
