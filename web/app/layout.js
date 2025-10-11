export const metadata = {
  title: 'LiveDrives Portal',
  description: 'Web portal for managing LiveDrives.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
