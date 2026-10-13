type CategoryWithTags = {
  id: string;
  name: string;
  colorHex: string;
  emoji: string | null;
  tags: { canEdit?: boolean; id: string; name: string; project: { name: string }; _count: { taskTags: number } }[];
};

export function summarizeTagCategories(categories: CategoryWithTags[]) {
  return categories.map(({ tags, ...category }) => ({
    ...category,
    taskCount: tags.reduce((total, tag) => total + tag._count.taskTags, 0),
    tags: tags.map(({ _count, project, ...tag }) => ({ ...tag, projectName: project.name, taskCount: _count.taskTags })),
  }));
}

export type TagCategorySummary = ReturnType<typeof summarizeTagCategories>[number];
