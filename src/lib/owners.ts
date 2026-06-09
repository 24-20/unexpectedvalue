// Structural shape consumed by PortfolioChart's relative-equity dropdown.
// Investor (from @/lib/investors) is a structural superset and passes through
// as `owners` without conversion.
export interface Owner {
  name: string;
  percentage: number;
}
