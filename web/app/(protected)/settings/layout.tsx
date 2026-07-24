import { SettingsSidebar } from "@/components/settings/settings-sidebar";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 md:flex-row">
      <SettingsSidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
