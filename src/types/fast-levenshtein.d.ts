declare module 'fast-levenshtein' {
  interface LevenshteinOptions {
    useCollator?: boolean;
  }

  interface FastLevenshtein {
    get(str1: string, str2: string, options?: LevenshteinOptions): number;
  }

  const levenshtein: FastLevenshtein;
  export default levenshtein;
}
