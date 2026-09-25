export type Category = { code: string; name: string; baseUom: string; altUoms: string[]; kind: 'consumable' | 'asset';
  returnable: boolean; hazardous: boolean; restricted: boolean; issueToPerson: boolean; required: string[];
  keywords: string[]; strong?: string[] };
export const TAXONOMY: Category[];
