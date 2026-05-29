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

  // NOTE: Firestore document references must have an EVEN number of path
  // segments. Intermediate grouping segments (ai/, b2c/) are intentionally
  // omitted so these resolve to valid documents and match firestore.rules.
  vectors: (tenantId: string) => `tenants/${tenantId}/vectors`,
  knowledgeBase: (tenantId: string) => `tenants/${tenantId}/knowledgeBase`,
  knowledgeDoc: (tenantId: string, docId: string) => `tenants/${tenantId}/knowledgeBase/${docId}`,
  conversationMessages: (tenantId: string, uid: string) =>
    `tenants/${tenantId}/conversations/${uid}/messages`,

  catalog: () => 'catalog',
  catalogProduct: (productId: string) => `catalog/${productId}`,
  b2cCustomer: (uid: string) => `customers/${uid}`,

  lrsStatements: () => 'lrs',
  lrsStatement: (stmtId: string) => `lrs/${stmtId}`,
  stripeEvent: (eventId: string) => `stripeEvents/${eventId}`,
} as const;
