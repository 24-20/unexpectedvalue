import { getInvestors } from "@/lib/investors";

// Public-safe slice of the investors table for live owner-dropdown updates.
// Names and percentages are already public on /owners and in the chart's
// relative-equity dropdown; invested NOK amounts and ids must not leave the
// server through this path.
export async function GET() {
  const investors = await getInvestors();
  return Response.json({
    owners: investors.map((i) => ({
      name: i.name,
      slug: i.slug,
      percentage: i.percentage,
    })),
  });
}
