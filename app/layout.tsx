import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";
import { GlobalStudentProvider } from "@/lib/context/GlobalStudentContext";
import { DocumentProvider } from "@/features/document-generator/state/DocumentContext";

const openSans = Open_Sans({
  subsets: ["latin"],
  // Variable font: one file per style covers every weight (400/600/700 used by Europass).
  style: ["normal", "italic"],
  variable: "--font-open-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Template Generator",
  description:
    "Dynamic Document & CV Template Generator — create, edit, and export professional documents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${openSans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="h-full" suppressHydrationWarning>
        <GlobalStudentProvider>
          <DocumentProvider>{children}</DocumentProvider>
        </GlobalStudentProvider>
      </body>
    </html>
  );
}
