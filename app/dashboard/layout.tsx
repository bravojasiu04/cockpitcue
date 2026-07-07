import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import { UserButton } from "@clerk/nextjs";
import DashboardSidebar from "./Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const user = await currentUser();

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid var(--border)", background: "rgba(13,17,23,0.95)" }}>
        <a href="/" className="flex items-center">
          <Image src="/logo.svg" alt="CockpitCue" width={110} height={32} style={{ objectFit: "contain" }} />
        </a>
        <div className="flex items-center gap-4">
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {user?.emailAddresses[0]?.emailAddress}
          </span>
          <UserButton appearance={{
            variables: {
              colorBackground: "#161B22",
              colorPrimary: "#00B4D8",
              colorNeutral: "#E6EDF3",
              borderRadius: "0.75rem",
            },
            elements: {
              userButtonPopoverCard: { border: "1px solid #30363D", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" },
              userButtonPopoverActionButton: { color: "#E6EDF3" },
              userButtonPopoverActionButtonText: { color: "#E6EDF3" },
              userButtonPopoverFooter: { display: "none" },
            }
          }} />
        </div>
      </nav>

      {/* Layout: sidebar + content */}
      <div className="flex">
        <DashboardSidebar />
        <div className="flex-1 min-w-0 flex flex-col">{children}</div>
      </div>
    </div>
  );
}
