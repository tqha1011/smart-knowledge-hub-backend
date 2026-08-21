import { Injectable } from '@nestjs/common';
import { decode, encode } from 'gpt-tokenizer';

const CHUNK_SIZE_TOKENS = 500;
const CHUNK_OVERLAP_TOKENS = 50;
export type TextChunk = {
  chunkIndex: number;
  content: string;
  tokens: number;
};

@Injectable()
export class ChunkingService {
  chunkText(text: string): TextChunk[] {
    // Implementation for chunking text
    if (!text || text.trim() === '') {
      return [];
    }
    const step = CHUNK_SIZE_TOKENS - CHUNK_OVERLAP_TOKENS;
    const chunks: TextChunk[] = [];
    const tokens = encode(text); // count sum of tokens of the text
    for (
      let start = 0, chunkIndex = 0;
      start < tokens.length;
      start += step, chunkIndex++
    ) {
      const chunkTokens = tokens.slice(start, start + CHUNK_SIZE_TOKENS);
      const content = decode(chunkTokens);
      chunks.push({
        chunkIndex,
        content,
        tokens: chunkTokens.length,
      });
    }
    return chunks;
  }
}
