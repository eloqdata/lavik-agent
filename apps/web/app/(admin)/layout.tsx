import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "Lavik · Agent operations",
  robots: { index: false, follow: false },
};
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
