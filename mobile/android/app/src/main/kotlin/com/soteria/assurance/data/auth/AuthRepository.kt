package com.soteria.assurance.data.auth

import com.soteria.assurance.data.model.Principal
import com.soteria.assurance.data.net.ForgeApi
import com.soteria.assurance.data.net.Session
import org.json.JSONObject

/**
 * Signs in against the Forge API (Django). The organization (tenant) id scopes the
 * lookup; superadmin accounts sign in with it blank. Roles and tenant membership come
 * from `GET /api/me` (Postgres is the source of truth), never from the token.
 */
class AuthRepository {

    /** The signed-in member as the API sees them, or null when there is no session. */
    suspend fun currentPrincipal(): Principal? {
        if (Session.access == null) return null
        val me = ForgeApi.request("GET", "me") as JSONObject
        val member = me.getJSONObject("member")
        return Principal(
            id = member.getString("id"),
            email = member.optString("email").ifBlank { null },
            role = member.optString("role"),
            tenantId = member.optString("tenantId").ifBlank { null },
        )
    }

    /** Signs in; pass a blank [tenantId] only for superadmin (platform-level) accounts. */
    suspend fun signIn(email: String, password: String, tenantId: String?): Principal {
        val body = JSONObject()
            .put("email", email.trim())
            .put("password", password)
            .put("client", "mobile")
        if (!tenantId.isNullOrBlank()) body.put("tenant", tenantId.trim())
        Session.tenantId = tenantId?.trim()?.ifBlank { null }
        try {
            val tokens = ForgeApi.request("POST", "auth/login", body, authenticated = false) as JSONObject
            Session.access = tokens.getString("access")
            Session.refresh = tokens.optString("refresh").ifBlank { null }
            return currentPrincipal() ?: error("Sign-in succeeded but no principal could be resolved")
        } catch (e: Exception) {
            Session.clear()
            throw e
        }
    }

    suspend fun signOut() {
        val refresh = Session.refresh
        runCatching {
            ForgeApi.request(
                "POST",
                "auth/logout",
                JSONObject().apply { refresh?.let { put("refresh", it) }; put("client", "mobile") },
            )
        }
        Session.clear()
    }
}
