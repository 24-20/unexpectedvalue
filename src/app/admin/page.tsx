import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminCookie } from "@/lib/adminAuth";
import { AdminOtpForm } from "@/components/admin/AdminOtpForm";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { getInvestors } from "@/lib/investors";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const authed = verifyAdminCookie(session);

  if (!authed) {
    return <AdminOtpForm />;
  }

  const investors = await getInvestors();
  return <AdminDashboard investors={investors} />;
}
