import Foundation

/// Reads the signed-in member's content from the Forge API. The API scopes every call
/// to the member's tenant (Postgres row-level security); this client layer is a
/// convenience only.
struct CourseService {
    /// Published courses for the tenant, ordered by title.
    func listPublishedCourses() async throws -> [Course] {
        let courses: [Course] = try await ForgeAPI.request("GET", "courses")
        return courses
            .filter { $0.status == "published" }
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    }

    /// A course's modules, each with its lessons, in order.
    func listModules(courseId: String) async throws -> [Module] {
        let outline: CourseOutline = try await ForgeAPI.request("GET", "courses/\(courseId)")
        return outline.modules.sorted { $0.order < $1.order }
    }
}
