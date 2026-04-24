import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TopNavContainer from "./components/top-nav-container";
import ChatWidget from "./components/chat-widget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NutriLens AI",
  description: "Snap a photo. Track your macros. Powered by Claude.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col relative">
        {/* Mesh-gradient backdrop now lives on <html> (see globals.css) so */}
        {/* it's part of the very first paint and never flashes in late — */}
        {/* no JSX layer or z-index compositing required. */}
        {/* Very faint SVG-noise grain — tactile, filmic feel. The data URI */}
        {/* is tiny so there's no meaningful paint delay, and keeping it as */}
        {/* a JSX layer lets us localize the blend-mode + opacity. */}
        <div
          aria-hidden
          className="fixed inset-0 -z-10 pointer-events-none opacity-[0.035] mix-blend-multiply"
          style={{
            backgroundImage:
              'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/></filter><rect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.9\'/></svg>")',
            backgroundSize: "160px 160px",
          }}
        />
        <TopNavContainer />
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
