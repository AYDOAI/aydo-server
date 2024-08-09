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
  identifier: string;
  token: string;
  log: {
    path: string;
  }
}