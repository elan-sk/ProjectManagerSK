import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAppCountryCode, getWhatsAppSettings } from "@/lib/appSettings";
import { getAvailableCountries } from "@/lib/holidays";
import { CountrySettingForm } from "../CountrySettingForm";
import { WorkScheduleForm } from "../WorkScheduleForm";
import { AdminOnly, SettingsCard } from "../SettingsCard";

export default async function ScheduleSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") return <AdminOnly />;
  const [countryCode, countries, whatsapp] = await Promise.all([getAppCountryCode(), getAvailableCountries(), getWhatsAppSettings()]);
  return (
    <>
      <SettingsCard title="País (festivos)">
        <p className="text-sm text-slate-500">
          Un único país para toda la app — se usa para calcular festivos y días hábiles en todos
          los proyectos.
        </p>
        <CountrySettingForm countries={countries} currentCountryCode={countryCode} />
      </SettingsCard>
      <SettingsCard title="Horario laboral y resumen diario">
        <WorkScheduleForm workHoursStart={whatsapp.workHoursStart} workHoursEnd={whatsapp.workHoursEnd} dailyDigestHour={whatsapp.dailyDigestHour} dailyDigestMinute={whatsapp.dailyDigestMinute} />
      </SettingsCard>
    </>
  );
}
