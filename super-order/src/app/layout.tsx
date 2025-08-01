import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { Toaster } from "@/components/ui/sonner";
import Providers from "./Providers";
const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "SuperOrder - Advanced Trading on 1inch Protocol",
    description:
        "Experience institutional-grade trading features: Stop Loss, Iceberg Orders, and OCO trading on the 1inch Limit Order Protocol",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark">
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased dark bg-gray-900 text-white min-h-screen`}
            >
                <Providers>
                    <Toaster />
                    {children}
                </Providers>
            </body>
        </html>
    );
}
