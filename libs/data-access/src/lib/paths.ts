/**
 * Centralized Firestore path builders. Keeping every path here makes the
 * tenant-scoped data model (§6) auditable and prevents accidental
 * cross-tenant reads from ad-hoc string concatenation.
 */
export const FsPaths = {
  platformConfig: () => 'platform/config',
  featureFlags: () => 'platform/featureFlags',

  tenants: () => 'tenants',
  tenant: (tenantId: string) => `tenants/${tenantId}`,

  members: (tenantId: string) => `tenants/${tenantId}/members`,
  member: (tenantId: string, uid: string) => `tenants/${tenantId}/members/${uid}`,

  courses: (tenantId: string) => `tenants/${tenantId}/courses`,
  course: (tenantId: string, courseId: string) => `tenants/${tenantId}/courses/${courseId}`,

  modules: (tenantId: string, courseId: string) =>
    `tenants/${tenantId}/courses/${courseId}/modules`,
  module: (tenantId: string, courseId: string, moduleId: string) =>
    `tenants/${tenantId}/courses/${courseId}/modules/${moduleId}`,

  enrollments: (tenantId: string, courseId: string) =>
    `tenants/${tenantId}/courses/${courseId}/enrollments`,
  enrollment: (tenantId: string, courseId: string, uid: string) =>
    `tenants/${tenantId}/courses/${courseId}/enrollments/${uid}`,

  quizzes: (tenantId: string) => `tenants/${tenantId}/quizzes`,
  quiz: (tenantId: string, quizId: string) => `tenants/${tenantId}/quizzes/${quizId}`,

  games: (tenantId: string) => `tenants/${tenantId}/games`,
  game: (tenantId: string, gameId: string) => `tenants/${tenantId}/games/${gameId}`,

  badges: (tenantId: string) => `tenants/${tenantId}/badges`,
  badge: (tenantId: string, badgeId: string) => `tenants/${tenantId}/badges/${badgeId}`,

  leaderboard: (tenantId: string, period: string) => `tenants/${tenantId}/leaderboard/${period}`,

  knowledgeBase: (tenantId: string) => `tenants/${tenantId}/ai/knowledgeBase`,
  conversationMessages: (tenantId: string, uid: string) =>
    `tenants/${tenantId}/ai/conversations/${uid}/messages`,

  catalog: () => 'b2c/catalog',
  catalogProduct: (productId: string) => `b2c/catalog/${productId}`,
  b2cCustomer: (uid: string) => `b2c/customers/${uid}`,

  lrsStatements: () => 'lrs/statements',
  stripeEvent: (eventId: string) => `stripe/events/${eventId}`,
} as const;
