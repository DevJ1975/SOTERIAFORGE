import { setGlobalOptions } from 'firebase-functions/v2';

// Region + concurrency defaults for all 2nd-gen functions.
setGlobalOptions({ region: 'us-central1', maxInstances: 20 });

export { setMemberRole } from './auth/set-custom-claims';
export { provisionTenant } from './tenants/provision-tenant';
export { setTenantStatus } from './tenants/lifecycle';
export { updateBranding } from './tenants/update-branding';
export { inviteMember, deactivateMember } from './members/invite-member';
export { submitQuiz } from './quizzes/submit-quiz';
export { completeModule } from './lms/complete-module';
export { stripeWebhook } from './stripe/webhook';
export { createCheckoutSession, createBillingPortalSession } from './stripe/checkout';
export { ingestStatement } from './lrs/ingest';
export { askTutor } from './ai/tutor-flow';
export { ingestKnowledge } from './ai/ingest-knowledge';
export { launchCmi5 } from './cmi5/launch';
export { cmi5Fetch } from './cmi5/fetch';
export { xapi } from './cmi5/xapi';
export { exportUserData, deleteUserData } from './compliance/data-rights';
