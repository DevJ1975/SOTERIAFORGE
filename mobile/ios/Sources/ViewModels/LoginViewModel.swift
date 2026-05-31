import Foundation

@MainActor
final class LoginViewModel: ObservableObject {
    @Published var tenantId = ""
    @Published var email = ""
    @Published var password = ""
    @Published var loading = false
    @Published var error: String?

    private let auth = AuthService()
    private let onSignedIn: (Principal) -> Void

    init(onSignedIn: @escaping (Principal) -> Void) {
        self.onSignedIn = onSignedIn
    }

    func submit() {
        guard !email.isEmpty, !password.isEmpty else {
            error = "Email and password are required"
            return
        }
        loading = true
        error = nil
        Task {
            do {
                let principal = try await auth.signIn(
                    email: email,
                    password: password,
                    gcipTenantId: tenantId.isEmpty ? nil : tenantId
                )
                loading = false
                onSignedIn(principal)
            } catch {
                loading = false
                self.error = error.localizedDescription
            }
        }
    }
}
