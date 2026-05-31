package com.soteria.assurance.data.auth

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.ktx.auth
import com.google.firebase.ktx.Firebase
import com.soteria.assurance.data.model.Principal
import kotlinx.coroutines.tasks.await

/**
 * Wraps Firebase Auth with **GCIP multi-tenancy**. The Identity Platform tenant
 * id must be set on the FirebaseAuth instance *before* sign-in, and custom
 * claims (`role`, `tenantId`, `entitlements`) are read from the ID token after.
 */
class AuthRepository(private val auth: FirebaseAuth = Firebase.auth) {

    /** Builds the current principal from the cached/refreshed ID token claims. */
    suspend fun currentPrincipal(forceRefresh: Boolean = false): Principal? {
        val user = auth.currentUser ?: return null
        val token = user.getIdToken(forceRefresh).await()
        val claims = token.claims
        return Principal(
            uid = user.uid,
            email = user.email,
            role = (claims["role"] as? String) ?: "",
            tenantId = claims["tenantId"] as? String,
            @Suppress("UNCHECKED_CAST")
            entitlements = (claims["entitlements"] as? List<String>) ?: emptyList(),
        )
    }

    /**
     * Signs in against a specific GCIP tenant. Pass [gcipTenantId] = null only
     * for superadmin (project-level) accounts.
     */
    suspend fun signIn(email: String, password: String, gcipTenantId: String?): Principal {
        auth.tenantId = gcipTenantId
        auth.signInWithEmailAndPassword(email.trim(), password).await()
        // Force-refresh so freshly-set custom claims are reflected immediately.
        return currentPrincipal(forceRefresh = true)
            ?: error("Sign-in succeeded but no principal could be resolved")
    }

    fun signOut() = auth.signOut()
}
