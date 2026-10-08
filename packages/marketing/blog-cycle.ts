// Deterministic draft failures use the same bounded correction as review findings.
// Invalid drafts are checkpointed but never sent to review or publication.
export async function runBlogRevisionCycle<D, W, R>(options: {
  rounds: number;
  drafts: D;
  feedback?: string;
  write: (drafts: D, feedback: string) => Promise<{ drafts: D; receipt: W }>;
  validate: (drafts: D) => string[];
  checkpoint: (drafts: D, errors: string[], round: number) => Promise<void>;
  review: (
    drafts: D,
  ) => Promise<{ passed: boolean; feedback: string; receipt: R }>;
}) {
  if (
    !Number.isInteger(options.rounds) ||
    options.rounds < 1 ||
    options.rounds > 2
  )
    throw new Error("No bounded writer correction remains");
  let drafts = options.drafts,
    feedback = options.feedback ?? "";
  for (let round = 0; round < options.rounds; round++) {
    const written = await options.write(drafts, feedback);
    drafts = written.drafts;
    const errors = options.validate(drafts);
    await options.checkpoint(drafts, errors, round);
    if (errors.length) {
      feedback = `Deterministic validation requires correction:\n${errors.join("\n")}`;
      continue;
    }
    const reviewed = await options.review(drafts);
    if (reviewed.passed)
      return { drafts, writer: written.receipt, reviewer: reviewed.receipt };
    feedback = reviewed.feedback;
  }
  throw new Error(
    `Blog still needs correction after the bounded attempts: ${feedback}`,
  );
}

// A provider failure during review does not require rewriting a valid saved draft.
// The caller verifies the original writer receipt and remaining task budget.
export async function reviewSavedBlogDraft<D, W, R>(options: {
  drafts: D;
  writer: W;
  validate: (drafts: D) => string[];
  review: (
    drafts: D,
  ) => Promise<{ passed: boolean; feedback: string; receipt: R }>;
}) {
  const errors = options.validate(options.drafts);
  if (errors.length)
    throw new Error(`Saved draft requires correction: ${errors.join("\n")}`);
  const reviewed = await options.review(options.drafts);
  if (!reviewed.passed)
    throw new Error(
      `Independent review requires correction: ${reviewed.feedback}`,
    );
  return {
    drafts: options.drafts,
    writer: options.writer,
    reviewer: reviewed.receipt,
  };
}
