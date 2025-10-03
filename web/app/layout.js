import './globals.css';

export const metadata = {
  title: 'Livedrives App',
  description: 'Dashboard for managing businesses and runs'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
