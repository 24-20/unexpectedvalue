export interface Owner {
  name: string;
  percentage: number;
}

export const OWNERS: ReadonlyArray<Owner> = [
  { name: "Owner One", percentage: 33.33 },
  { name: "Owner Two", percentage: 33.33 },
  { name: "Owner Three", percentage: 33.34 },
];
