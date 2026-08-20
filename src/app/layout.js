import { Geist, Manrope } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata = {
  title: "FunevDesk",
  description: "Service desk, monitoramento e suporte remoto para matriz e filiais.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <Toaster richColors position="top-center" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
