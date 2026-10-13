import { z } from "zod";

export const tagNameSchema = z.string().trim().min(1).max(80);
