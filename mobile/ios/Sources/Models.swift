import Foundation
import FirebaseFirestore

/// Mirrors `libs/shared/src/lib/schemas` in the soteriaforge web platform.
/// Field names MUST match the Firestore documents written by the web/admin apps.

/// Resolved authenticated principal, built from the Firebase ID token claims.
struct Principal {
    let uid: String
    let email: String?
    let role: String
    let tenantId: String?
    let entitlements: [String]

    var isSuperadmin: Bool { role == "superadmin" }
}

/// Module completion criteria (mirrors module.completion in the schema).
struct Completion: Codable {
    var minScore: Double?
    var minProgressPct: Double?
}

/// /tenants/{tenantId}/courses/{courseId}
struct Course: Codable, Identifiable {
    @DocumentID var id: String?
    var tenantId: String = ""
    var title: String = ""
    var description: String = ""
    var status: String = "draft"
    var tags: [String] = []
    var badgeRefs: [String] = []
    var xpReward: Int = 0
    var sourceLibraryId: String?
    var createdAt: String?
    var updatedAt: String?
}

/// /tenants/{tenantId}/courses/{courseId}/modules/{moduleId}
struct Module: Codable, Identifiable {
    @DocumentID var id: String?
    var courseId: String = ""
    var tenantId: String = ""
    var title: String = ""
    var order: Int = 0
    var contentType: String = "video"
    var assetRef: String?
    var externalUrl: String?
    var xpReward: Int = 0
    var badgeRefs: [String] = []
    var completion: Completion?
    var createdAt: String?
    var updatedAt: String?
}

/// /tenants/{tenantId}/courses/{courseId}/enrollments/{uid}
/// The document id is the learner's uid (mirrors `enrollment.uid` in the schema).
struct Enrollment: Codable, Identifiable {
    @DocumentID var uid: String?
    var id: String? { uid }
    var courseId: String = ""
    var tenantId: String = ""
    var progressPct: Double = 0
    var completed: Bool = false
    var score: Double?
    var lastActivityAt: String?
    var assigned: Bool?
    var assignedBy: String?
    var assignedAt: String?
    var dueAt: String?
    var createdAt: String?
    var updatedAt: String?
}
