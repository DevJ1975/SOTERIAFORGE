import Foundation

/// Signs in against the Forge API (Django). The organization (tenant) id scopes the
/// lookup; superadmin accounts sign in with it blank. Role and tenant membership come
/// from `GET /api/me` (Postgres is the source of truth), never from the token.
struct AuthService {
    private struct Tokens: Decodable {
        let access: String
        let refresh: String?
    }

    private struct Me: Decodable {
        struct Member: Decodable {
            let id: String
            let email: String?
            let role: String
            let tenantId: String?
        }
        let member: Member
    }

    /// The signed-in member as the API sees them, or nil when there is no session.
    func currentPrincipal() async throws -> Principal? {
        guard Session.shared.access != nil else { return nil }
        let me: Me = try await ForgeAPI.request("GET", "me")
        return Principal(
            id: me.member.id,
            email: me.member.email,
            role: me.member.role,
            tenantId: me.member.tenantId
        )
    }

    /// Signs in. Pass a blank `tenantId` only for superadmin (platform-level) accounts.
    func signIn(email: String, password: String, tenantId: String?) async throws -> Principal {
        var body: [String: Any] = [
            "email": email.trimmingCharacters(in: .whitespaces),
            "password": password,
            "client": "mobile",
        ]
        let tenant = tenantId?.trimmingCharacters(in: .whitespaces)
        if let tenant, !tenant.isEmpty { body["tenant"] = tenant }
        Session.shared.tenantId = (tenant?.isEmpty == false) ? tenant : nil
        do {
            let tokens: Tokens = try await ForgeAPI.request("POST", "auth/login", body: body, authenticated: false)
            Session.shared.access = tokens.access
            Session.shared.refresh = tokens.refresh
            guard let principal = try await currentPrincipal() else {
                throw NSError(
                    domain: "SoteriaAuth", code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Sign-in succeeded but no principal resolved"]
                )
            }
            return principal
        } catch {
            Session.shared.clear()
            throw error
        }
    }

    func signOut() async {
        var body: [String: Any] = ["client": "mobile"]
        if let refresh = Session.shared.refresh { body["refresh"] = refresh }
        try? await ForgeAPI.send("POST", "auth/logout", body: body)
        Session.shared.clear()
    }
}
