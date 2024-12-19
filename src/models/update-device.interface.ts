export interface IUpdateDevice {
  device_name: string;
  device_ident: string;
  settings?: { [key: string]: string };
  gateway: string;
}
