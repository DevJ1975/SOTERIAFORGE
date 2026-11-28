import Foundation

/// The API refused or failed; `message` is the API's `detail` when it sent one.
struct APIError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

/// In-memory session for the Forge API. Tokens are never written to disk.
final class Session {
    static let shared = Session()
    var access: String?
    var refresh: String?
    var tenantId: String?

    func clear() {
        access = nil
        refresh = nil
        tenantId = nil
    }
}

/// Minimal JSON client for the Forge API (Django on Railway), on plain `URLSession`.
struct ForgeAPI {
    /// The Forge API. Point this at `http://localhost:8000` for a local backend.
    static let baseURL = URL(string: "https://api.soteriaforge.com")!

    /// Sends `body` (if any) to `/api/<path>` and returns the decoded response.
    static func request<T: Decodable>(
        _ method: String,
        _ path: String,
        body: [String: Any]? = nil,
        authenticated: Bool = true
    ) async throws -> T {
        var (data, status) = try await send(method, path, body: body, authenticated: authenticated)
        if status == 401, authenticated, try await refreshTokens() {
            (data, status) = try await send(method, path, body: body, authenticated: authenticated)
        }
        guard (200..<300).contains(status) else {
            let detail = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.detail
            throw APIError(status: status, message: detail ?? "Request failed (\(status))")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// For calls whose response body is ignored (e.g. 204 No Content).
    static func send(_ method: String, _ path: String, body: [String: Any]? = nil) async throws {
        let (_, status) = try await send(method, path, body: body, authenticated: true)
        guard (200..<300).contains(status) else {
            throw APIError(status: status, message: "Request failed (\(status))")
        }
    }

    private struct ErrorBody: Decodable { let detail: String? }

    private static func send(
        _ method: String,
        _ path: String,
        body: [String: Any]?,
        authenticated: Bool
    ) async throws -> (Data, Int) {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/\(path)"))
        request.httpMethod = method
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let tenant = Session.shared.tenantId {
            request.setValue(tenant, forHTTPHeaderField: "X-Forge-Tenant")
        }
        if authenticated, let token = Session.shared.access {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    private struct Tokens: Decodable {
        let access: String
        let refresh: String?
    }

    /// Swaps the refresh token for a new access token. False when the session is over.
    private static func refreshTokens() async throws -> Bool {
        guard let refresh = Session.shared.refresh else { return false }
        let (data, status) = try await send(
            "POST", "auth/refresh", body: ["refresh": refresh, "client": "mobile"], authenticated: false
        )
        guard (200..<300).contains(status), let tokens = try? JSONDecoder().decode(Tokens.self, from: data) else {
            Session.shared.clear()
            return false
        }
        Session.shared.access = tokens.access
        if let next = tokens.refresh { Session.shared.refresh = next }
        return true
    }
}
