import { z } from "zod";

export const scheduleSchema = z
  .object({
    schemaVersion: z.literal(1),
    enabled: z.boolean(),
    timezone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
    blogIntervalDays: z.number().int().min(1).max(30),
    dailyCheckHour: z.number().int().min(0).max(23),
    weeklyReportDay: z.literal("Monday"),
    automaticWebsitePublication: z.boolean(),
    maximumConcurrentTasks: z.literal(1),
    maximumModelCallsPerBlog: z.literal(4),
    topicRotation: z.array(z.string().min(20)).min(1),
  })
  .strict();

export const calendarDay = (date: Date, timezone: string) =>
  date.toLocaleDateString("en-CA", { timeZone: timezone });
export const addCalendarDays = (date: string, count: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + count * 86_400_000)
    .toISOString()
    .slice(0, 10);
export const mondayOf = (date: string) =>
  addCalendarDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
