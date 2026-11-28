package com.soteria.assurance.data.net

import com.soteria.assurance.BuildConfig
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/** The API refused or failed; [message] is the API's `detail` when it sent one. */
class ApiException(val status: Int, message: String) : Exception(message)

/** In-memory session for the Forge API. Tokens are never written to disk. */
object Session {
    var access: String? = null
    var refresh: String? = null
    var tenantId: String? = null

    fun clear() {
        access = null
        refresh = null
        tenantId = null
    }
}

/**
 * Minimal JSON client for the Forge API (Django on Railway). Uses only the platform's
 * `HttpURLConnection` and `org.json`, so the app needs no networking dependency.
 */
object ForgeApi {
    private const val TIMEOUT_MS = 15_000

    /** Sends [body] (if any) to `/api/<path>` and returns the parsed JSON (object or array). */
    suspend fun request(
        method: String,
        path: String,
        body: JSONObject? = null,
        authenticated: Boolean = true,
    ): Any = withContext(Dispatchers.IO) {
        val first = send(method, path, body, authenticated)
        if (first.status == 401 && authenticated && refreshTokens()) {
            parse(send(method, path, body, authenticated))
        } else {
            parse(first)
        }
    }

    private class Reply(val status: Int, val text: String)

    private fun send(method: String, path: String, body: JSONObject?, authenticated: Boolean): Reply {
        val url = URL(BuildConfig.API_BASE_URL.trimEnd('/') + "/api/" + path.trimStart('/'))
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = TIMEOUT_MS
            conn.readTimeout = TIMEOUT_MS
            conn.setRequestProperty("Accept", "application/json")
            Session.tenantId?.let { conn.setRequestProperty("X-Forge-Tenant", it) }
            if (authenticated) {
                Session.access?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            }
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val status = conn.responseCode
            val stream = if (status in 200..399) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            return Reply(status, text)
        } finally {
            conn.disconnect()
        }
    }

    private fun parse(reply: Reply): Any {
        if (reply.status !in 200..299) {
            val detail = runCatching { JSONObject(reply.text).optString("detail") }.getOrNull()
            throw ApiException(reply.status, detail?.takeIf { it.isNotBlank() } ?: "Request failed (${reply.status})")
        }
        val text = reply.text.trim()
        return when {
            text.startsWith("[") -> JSONArray(text)
            text.isEmpty() -> JSONObject()
            else -> JSONObject(text)
        }
    }

    /** Swaps the refresh token for a new access token. False when the session is over. */
    private fun refreshTokens(): Boolean {
        val refresh = Session.refresh ?: return false
        val payload = JSONObject().put("refresh", refresh).put("client", "mobile")
        val reply = runCatching { send("POST", "auth/refresh", payload, authenticated = false) }
            .getOrNull() ?: return false
        if (reply.status !in 200..299) {
            Session.clear()
            return false
        }
        val json = JSONObject(reply.text)
        Session.access = json.optString("access").ifBlank { null }
        json.optString("refresh").takeIf { it.isNotBlank() }?.let { Session.refresh = it }
        return Session.access != null
    }
}
