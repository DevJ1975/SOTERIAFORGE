import Foundation

@MainActor
final class CoursesViewModel: ObservableObject {
    @Published var loading = true
    @Published var courses: [Course] = []
    @Published var error: String?

    private let principal: Principal
    private let service = CourseService()

    init(principal: Principal) {
        self.principal = principal
        // Initial load is triggered by the view's `.task`, not here, to avoid
        // side-effecting async work during init (and during SwiftUI previews).
    }

    func refresh() {
        guard let tenantId = principal.tenantId else {
            loading = false
            error = "No tenant bound to this account"
            return
        }
        loading = true
        error = nil
        Task {
            do {
                courses = try await service.listPublishedCourses(tenantId: tenantId)
                loading = false
            } catch {
                loading = false
                self.error = error.localizedDescription
            }
        }
    }
}
