// The same message checks and Discord body the server uses, so the editor
// can show problems and the exact JSON before anything is sent.
export {
  componentRows,
  embedIsEmpty,
  planProblem,
  studioVariables,
  v2Sections,
  normaliseStudio,
  parseMessageLink,
  placeOf,
  placedIn,
  v2Lines,
  studioPayload,
  studioProblem,
  studioIssue,
  planIssue,
  type StudioIssue,
} from '../../../../packages/core/src/studio-format.ts';
export {
  fromDiscord,
  jsonErrorLine,
} from '../../../../packages/core/src/studio-import.ts';
