import Foundation
import FirebaseFirestore

/// Reads tenant-scoped content. All paths are rooted at `/tenants/{tenantId}/...`
/// so Firestore rules enforce isolation server-side (`claims.tenantId == tenantId`);
/// this client layer is a convenience only.
struct CourseService {
    private var db: Firestore { Firestore.firestore() }

    private func courses(_ tenantId: String) -> CollectionReference {
        db.collection("tenants").document(tenantId).collection("courses")
    }

    func listPublishedCourses(tenantId: String) async throws -> [Course] {
        let snapshot = try await courses(tenantId)
            .whereField("status", isEqualTo: "published")
            .order(by: "title")
            .getDocuments()
        return try snapshot.documents.map { try $0.data(as: Course.self) }
    }

    func getCourse(tenantId: String, courseId: String) async throws -> Course {
        try await courses(tenantId).document(courseId).getDocument(as: Course.self)
    }

    func listModules(tenantId: String, courseId: String) async throws -> [Module] {
        let snapshot = try await courses(tenantId)
            .document(courseId)
            .collection("modules")
            .order(by: "order")
            .getDocuments()
        return try snapshot.documents.map { try $0.data(as: Module.self) }
    }
}
