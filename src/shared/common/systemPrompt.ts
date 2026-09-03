export class SystemPrompt {
  static GenerateChatPrompt(): string {
    return (
      'You are a knowledge base assistant. Answer the question using only the ' +
      'information in the provided context. Cite sources inline with their [n] ' +
      "index. If the context does not contain the answer, say you don't know."
    );
  }

  static GenerateSessionTitlePrompt(): string {
    return (
      'You are a knowledge base assistant. Generate a concise and descriptive title ' +
      'for the session based on the chat history and the latest user question.'
    );
  }
}
