import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (see .env.example)"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required (see .env.example)"),
});

let cached: z.infer<typeof envSchema> | null = null;

/** Parsed lazily so that importing a module never crashes a build without env. */
export function env(): z.infer<typeof envSchema> {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
