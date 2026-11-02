// Plan morning-digest § 1. The run log reader's contract: section 2 builds against this file.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string; // ISO time with the log's own offset, kept as written
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night.
export type DigestRow = {
  job: string;
  owner: string | null; // from the latest line; null stays null, the view shows `—`
  runs: number; // every line for the job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus; // from the latest line by `at`
  lastError: string | null; // `error` of the latest line, null when it has none
  first: string; // earliest `at`, as written in the log
  last: string; // latest `at`, as written in the log
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job name
  badLines: number; // non-blank lines that did not parse; counted, never thrown
};

// readNight(runsDir, night) reads `<runsDir>/<night>.jsonl`.
// - No file (or a night not shaped YYYY-MM-DD): returns null. Routes answer 404.
// - Empty file: { rows: [], badLines: 0 }. Routes render "nothing ran".
// Implemented in ./read.ts.
export type ReadNight = (runsDir: string, night: string) => Night | null;
