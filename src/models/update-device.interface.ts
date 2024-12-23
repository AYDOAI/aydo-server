export interface IUpdateDevice {
  device_name: string;
  device_ident: string;
  zone_id: number;
  settings?: { [key: string]: string };
  gateway: string;
}
