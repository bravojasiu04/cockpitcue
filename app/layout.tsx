import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "CockpitCue — Train Your Memory Items",
  description:
    "The modern platform for pilots to practice cockpit flows and memory items. Build muscle memory that translates directly to flight safety.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={{
      variables: {
        colorBackground: "#161B22",
        colorText: "#E6EDF3",
        colorTextSecondary: "#8B949E",
        colorPrimary: "#00B4D8",
        colorNeutral: "#E6EDF3",
        colorInputBackground: "#0D1117",
        colorInputText: "#E6EDF3",
        borderRadius: "0.75rem",
      },
      elements: {
        card: { background: "#161B22", border: "1px solid #30363D", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" },
        headerTitle: { color: "#E6EDF3" },
        headerSubtitle: { color: "#8B949E" },
        socialButtonsBlockButton: { background: "#0D1117", border: "1px solid #30363D", color: "#E6EDF3" },
        socialButtonsBlockButtonText: { color: "#E6EDF3" },
        badge: { color: "#8B949E", background: "transparent", border: "1px solid #30363D" },
        dividerLine: { background: "#30363D" },
        dividerText: { color: "#8B949E" },
        formFieldLabel: { color: "#8B949E" },
        formFieldInput: { background: "#0D1117", border: "1px solid #30363D", color: "#E6EDF3" },
        footerActionLink: { color: "#00B4D8" },
        footerActionText: { color: "#8B949E" },
        identityPreviewText: { color: "#E6EDF3" },
        formButtonPrimary: { background: "#00B4D8", color: "#0D1117" },
        profileSectionTitleText: { color: "#E6EDF3" },
        profileSectionTitle: { borderColor: "#30363D" },
        profileSectionContent: { color: "#E6EDF3" },
        profileSectionPrimaryButton: { color: "#00B4D8" },
        navbarButton: { color: "#8B949E" },
        navbarButtonText: { color: "#8B949E" },
        userPreviewMainIdentifier: { color: "#E6EDF3" },
        userPreviewSecondaryIdentifier: { color: "#8B949E" },
        accordionTriggerButton: { color: "#E6EDF3" },
        formFieldLabelRow: { color: "#8B949E" },
        breadcrumbsItem: { color: "#8B949E" },
        breadcrumbsItemDivider: { color: "#8B949E" },
      }
    }}>
      <html lang="en" className={inter.variable}>
        <body className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
          <Script src="https://www.googletagmanager.com/gtag/js?id=G-HPHYJF63NR" strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-HPHYJF63NR');
          `}</Script>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
