import type { LearningUi } from "./LearningsPanel";

type Row = {
  id: string;
  topic: string;
  title: string;
  evidence: string;
  recommendation: string;
  status: LearningUi["status"];
  cutoff: string | null;
  source: string;
  createdAt: Date;
  project: { id: string; name: string } | null;
  person: { name: string } | null;
};

export function toLearningUi(l: Row): LearningUi {
  return { ...l, createdAt: l.createdAt.toISOString(), project: l.project ? { id: l.project.id, name: l.project.name } : null, person: l.person ? { name: l.person.name } : null };
}
