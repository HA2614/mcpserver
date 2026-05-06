import { z } from "zod";
import { ValidationError } from "./errors.js";

const taskSchema = z.object({
  task: z.string().min(1),
  ownerRole: z.string().min(1),
  estimateDays: z.number().nonnegative(),
  dependencies: z.array(z.string()).default([])
});

const milestoneSchema = z.object({
  name: z.string().min(1),
  week: z.number().int().positive(),
  deliverables: z.array(z.string()).default([])
});

export const planSchema = z.object({
  summary: z.string().min(1),
  recommendedTechStack: z.array(z.string()).default([]),
  taskBreakdown: z.array(taskSchema).min(1).max(8),
  estimatedTimelineWeeks: z.number().positive(),
  estimatedBudgetUsd: z.number().nonnegative(),
  risks: z.array(z.string()).default([]),
  milestones: z.array(milestoneSchema).max(5).default([])
});

export function validatePlanOrThrow(plan, provider = "unknown") {
  const parsed = planSchema.safeParse(plan);
  if (!parsed.success) {
    throw new ValidationError(`AI plan schema validation failed for provider ${provider}`, parsed.error.flatten());
  }
  return parsed.data;
}
