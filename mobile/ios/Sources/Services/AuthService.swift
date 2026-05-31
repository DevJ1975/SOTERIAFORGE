import Foundation
import FirebaseAuth

/// Wraps Firebase Auth with **GCIP multi-tenancy**. The Identity Platform tenant
/// id is set on the Auth instance *before* sign-in, and custom claims
/// (`role`, `tenantId`, `entitlements`) are read from the ID token afterwards.
struct AuthService {
    private var auth: Auth { Auth.auth() }

    /// Builds the current principal from the (optionally refreshed) ID token.
    func currentPrincipal(forceRefresh: Bool = false) async throws -> Principal? {
        guard let user = auth.currentUser else { return nil }
        let result = try await user.idTokenResult(forcingRefresh: forceRefresh)
        let claims = result.claims
        return Principal(
            uid: user.uid,
            email: user.email,
            role: claims["role"] as? String ?? "",
            tenantId: claims["tenantId"] as? String,
            entitlements: claims["entitlements"] as? [String] ?? []
        )
    }

    /// Signs in against a specific GCIP tenant. Pass `gcipTenantId == nil` only
    /// for superadmin (project-level) accounts.
    func signIn(email: String, password: String, gcipTenantId: String?) async throws -> Principal {
        auth.tenantID = gcipTenantId
        _ = try await auth.signIn(
            withEmail: email.trimmingCharacters(in: .whitespaces),
            password: password
        )
        // Force-refresh so freshly-set custom claims are reflected immediately.
        guard let principal = try await currentPrincipal(forceRefresh: true) else {
            throw NSError(
                domain: "SoteriaAuth", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Sign-in succeeded but no principal resolved"]
            )
        }
        return principal
    }

    func signOut() throws { try auth.signOut() }
}
