export interface ConfigFile {
  port: number;
  https_port?: number;
  key?: string;
  mdnsPort: number;
  certificate?: string;
  environment: 'production';
  production?: {
    dialect: 'sqlite';
    database: string;
    storage: string;
  };
  cloud?: {
    url?: string;
  };
  identifier: string;
  token: string;
  log: {
    path: string;
  }
}
