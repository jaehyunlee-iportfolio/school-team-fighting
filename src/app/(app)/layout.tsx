import { LoginGate } from "@/components/login-gate";
import { AppShell } from "@/components/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LoginGate>
      <AppShell>{children}</AppShell>
    </LoginGate>
  );
}
