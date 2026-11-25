export function buildRetrievalText(blueprint, requirements = "") {
  return [
    blueprint.topic,
    blueprint.type,
    blueprint.difficulty,
    blueprint.focus,
    blueprint.evidence,
    requirements,
  ].join("\n");
}

export function retrieveExamples(vectors, blueprint, requirements) {
  const prompt = buildRetrievalText(blueprint, requirements);
  const references = vectors.search(prompt, 3);
  return {
    prompt,
    references,
    examples: references.map(({ stem, answer }) => ({ stem, answer })),
  };
}
