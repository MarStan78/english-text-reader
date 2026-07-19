export function buildPrompt(text, accent) {
  const instruction = accent === 'american'
    ? 'Read the following text aloud in a natural American English accent:'
    : 'Read the following text aloud in a natural British English accent:';
  return instruction + '\n\n' + text;
}
