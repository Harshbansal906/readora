import type { Metadata } from "next";
import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Readora — Where readers become creators | Antigravity AI",
  description: "A quiet, print-inspired long-form journal with Google Antigravity & CopilotKit integration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Points directly to the Python FastAPI ag-ui-antigravity adapter backend
  const runtimeUrl = process.env.NEXT_PUBLIC_COPILOT_RUNTIME_URL || "http://localhost:8000/copilotkit";

  return (
    <html lang="en">
      <body>
        <CopilotKit runtimeUrl={runtimeUrl}>
          {children}
        </CopilotKit>
      </body>
    </html>
  );
}
