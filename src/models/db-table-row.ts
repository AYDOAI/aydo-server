export class DbTableRow {
  id: number;
  params: string;
  value: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date;

  constructor(data) {
    this.created_at = new Date();
    this.updated_at = new Date();
    Object.keys(data).forEach(itemKey => {
      this[itemKey] = data[itemKey];
    });
  }

}