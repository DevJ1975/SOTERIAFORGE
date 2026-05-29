import { setGlobalOptions } from 'firebase-functions/v2';

// Region + concurrency defaults for all 2nd-gen functions.
setGlobalOptions({ region: 'us-central1', maxInstances: 20 });

export { setMemberRole } from './auth/set-custom-claims';
export { provisionTenant } from './tenants/provision-tenant';
export { stripeWebhook } from './stripe/webhook';
export { ingestStatement } from './lrs/ingest';
export { askTutor } from './ai/tutor-flow';
