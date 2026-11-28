export { TutorService } from './lib/tutor.service';
export type { TutorMessage } from './lib/tutor.service';
export { CoachDiagramComponent } from './lib/coach-diagram.component';
export { TutorChatComponent } from './lib/tutor-chat.component';
export { IngestService } from './lib/ingest.service';
export type { IngestInput, IngestResult } from './lib/ingest.service';
export { CoachApi, CoachRequestError, coachError, createSseParser } from './lib/coach-api';
export type {
  AskInput,
  AskStreamHandlers,
  CoachAgentId,
  CoachCitation,
  CoachDiagram,
  CoachRating,
  CoachStage,
  ReviewItem,
  ReviewQueue,
  ReviewStatus,
  TutorAnswer,
  CoachCourse,
  CoachProfile,
  CoachReference,
  CoachSource,
} from './lib/coach-api';
