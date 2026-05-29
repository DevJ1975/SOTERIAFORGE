import { XAPI_VERBS } from '@forge/shared';

/**
 * A single xAPI verb descriptor with id and display label.
 */
export interface XapiVerbDescriptor {
  id: string;
  display: Record<string, string>;
}

/**
 * Friendly-name-keyed map of xAPI verb descriptors.
 * Each entry carries the canonical IRI and a default en-US display label.
 */
export const VERB_MAP: Record<keyof typeof XAPI_VERBS, XapiVerbDescriptor> = {
  launched: {
    id: XAPI_VERBS.launched,
    display: { 'en-US': 'launched' },
  },
  initialized: {
    id: XAPI_VERBS.initialized,
    display: { 'en-US': 'initialized' },
  },
  progressed: {
    id: XAPI_VERBS.progressed,
    display: { 'en-US': 'progressed' },
  },
  completed: {
    id: XAPI_VERBS.completed,
    display: { 'en-US': 'completed' },
  },
  passed: {
    id: XAPI_VERBS.passed,
    display: { 'en-US': 'passed' },
  },
  failed: {
    id: XAPI_VERBS.failed,
    display: { 'en-US': 'failed' },
  },
  answered: {
    id: XAPI_VERBS.answered,
    display: { 'en-US': 'answered' },
  },
  terminated: {
    id: XAPI_VERBS.terminated,
    display: { 'en-US': 'terminated' },
  },
};

/** Friendly verb name type. */
export type FriendlyVerbName = keyof typeof VERB_MAP;

/**
 * Look up a verb descriptor by friendly name.
 * Returns undefined if the name is not recognized.
 */
export function getVerb(name: FriendlyVerbName): XapiVerbDescriptor {
  return VERB_MAP[name];
}
