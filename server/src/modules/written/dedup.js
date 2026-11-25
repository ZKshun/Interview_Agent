export async function admitQuestion(vectors, task, question) {
  return vectors.insert({
    id: question.id,
    taskId: task.id,
    prompt: question.retrievalPrompt,
    stem: question.content.stem,
    answer: question.content.answer,
    score: question.validation.score,
    topic: question.blueprint.topic,
  });
}
