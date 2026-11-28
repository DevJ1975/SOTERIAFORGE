import Foundation

/// Wire shapes of the Forge API (`backend/apps/learning/serializers.py`, camelCase JSON).

/// The signed-in member, as returned by `GET /api/me`.
struct Principal {
    let id: String
    let email: String?
    let role: String
    let tenantId: String?

    var isSuperadmin: Bool { role == "superadmin" }
}

/// A course in the member's tenant.
struct Course: Codable, Identifiable {
    var id: String
    var title: String = ""
    var description: String = ""
    var status: String = "draft"
    var tags: [String] = []
    var availableOffline: Bool = false
    var createdAt: String?
    var updatedAt: String?
}

/// One content item in a module.
struct Lesson: Codable, Identifiable {
    var id: String
    var title: String = ""
    var order: Int = 0
    var contentType: String = "video"
    var estimatedMinutes: Int?
    var completed: Bool = false
}

/// A module group within a course; the content lives in its lessons.
struct Module: Codable, Identifiable {
    var id: String
    var courseId: String = ""
    var title: String = ""
    var label: String = ""
    var order: Int = 0
    var lessons: [Lesson] = []
}

/// `GET /api/courses/{id}`: the course with its modules and lessons.
struct CourseOutline: Codable {
    var modules: [Module] = []
}
