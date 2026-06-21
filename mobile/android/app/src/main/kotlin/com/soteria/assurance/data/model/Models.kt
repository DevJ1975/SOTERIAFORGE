package com.soteria.assurance.data.model

import com.google.firebase.firestore.DocumentId

/**
 * Mirrors `libs/shared/src/lib/schemas` in the soteriaforge web platform.
 * Field names MUST match the Firestore documents written by the web/admin apps.
 */

/** Resolved authenticated principal, built from the Firebase ID token claims. */
data class Principal(
    val uid: String,
    val email: String?,
    val role: String,
    val tenantId: String?,
    val entitlements: List<String> = emptyList(),
) {
    val isSuperadmin: Boolean get() = role == "superadmin"
}

/** Module completion criteria (mirrors module.completion in the schema). */
data class Completion(
    val minScore: Double? = null,
    val minProgressPct: Double? = null,
)

/** /tenants/{tenantId}/courses/{courseId} */
data class Course(
    @DocumentId val id: String = "",
    val tenantId: String = "",
    val title: String = "",
    val description: String = "",
    val status: String = "draft",
    val tags: List<String> = emptyList(),
    val badgeRefs: List<String> = emptyList(),
    val xpReward: Long = 0,
    val sourceLibraryId: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

/** /tenants/{tenantId}/courses/{courseId}/modules/{moduleId} */
data class Module(
    @DocumentId val id: String = "",
    val courseId: String = "",
    val tenantId: String = "",
    val title: String = "",
    val order: Long = 0,
    val contentType: String = "video",
    val assetRef: String? = null,
    val externalUrl: String? = null,
    val xpReward: Long = 0,
    val badgeRefs: List<String> = emptyList(),
    val completion: Completion = Completion(),
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

/** /tenants/{tenantId}/courses/{courseId}/enrollments/{uid} */
data class Enrollment(
    @DocumentId val uid: String = "",
    val courseId: String = "",
    val tenantId: String = "",
    val progressPct: Double = 0.0,
    val completed: Boolean = false,
    val score: Double? = null,
    val lastActivityAt: String? = null,
    val assigned: Boolean? = null,
    val assignedBy: String? = null,
    val assignedAt: String? = null,
    val dueAt: String? = null,
    val cmi: Map<String, Any?> = emptyMap(),
    val createdAt: String? = null,
    val updatedAt: String? = null,
)
