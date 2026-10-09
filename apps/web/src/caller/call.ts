/**
 * What the caller says, in pieces a voice can take apart.
 *
 * Nearly everything a caller says is known in advance (the scores, "you
 * require", "game shot") and is played from recorded clips (clips.ts). A
 * player's name is not, so it is kept apart from the words around it, and only
 * the name goes to the browser's speech.
 */

export type Spoken = string | { readonly name: string };

/** One call, said in one breath: `[{ name: 'Ann' }, 'you require forty']`. */
export type Call = readonly Spoken[];

/** A call as one sentence, for a voice that can say any text. */
export function callText(call: Call): string {
  return call.map((part) => (typeof part === 'string' ? part : part.name)).join(', ');
}

/** The words of a call, without the names: what a clip pack has to hold. */
export function callWords(call: Call): string[] {
  return call.filter((part): part is string => typeof part === 'string');
}

/** The key a phrase is filed under in a clip pack: case and punctuation do not matter. */
export function clipKey(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
