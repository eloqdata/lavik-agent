export default function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div id="main" tabIndex={-1}>
      {children}
    </div>
  );
}
